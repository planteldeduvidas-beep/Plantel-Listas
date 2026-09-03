const fs = require("node:fs/promises");
const AppError = require("../../shared/errors/AppError");
const { ESCOPO_GESTAO } = require("../../shared/providers/googleDriveProvider");
const { inteiroPositivo, validarUpload, validarEdicao, validarMovimentacao, validarVersao, identificarArquivo } = require("./gestaoMateriaisValidator");

function criarGestaoMateriaisService(dependencias) {
  const repository = dependencias.repository;
  const provider = dependencias.provider;
  const integracaoService = dependencias.integracaoService;
  const configuracao = dependencias.configuracao;

  function publicar(material) {
    return { id:material.id,nome:material.nome,tipo:material.tipo,extensao:material.extensao,tamanhoBytes:material.tamanhoBytes,categoriaId:material.categoriaId,disciplinaId:material.disciplinaId,concursoId:material.concursoId,estado:material.estado,versao:material.versao };
  }

  function exigirPapelDeGestao(usuario) {
    if (!usuario || !["professor", "admin"].includes(usuario.papel)) {
      throw new AppError("Usuario sem permissao", 403, "SEM_PERMISSAO");
    }
  }

  function exigirEscopoDeEscrita() {
    if (!provider || provider.escopo !== ESCOPO_GESTAO) {
      throw new AppError("A conexao com o Google Drive precisa ser renovada para permitir alteracoes",409,"GOOGLE_RECONEXAO_ESCRITA_NECESSARIA");
    }
  }

  async function token() {
    exigirEscopoDeEscrita();
    return integracaoService.obterRefreshTokenParaUso();
  }

  async function exigirPastaDoAcervo(refreshToken, pastaDriveId) {
    const pasta = await executarGoogle(function obterPasta() {
      return provider.obterItem(refreshToken, pastaDriveId);
    });
    const dentroDaRaiz = pasta.id === provider.pastaRaizId
      || await executarGoogle(function verificarPasta() {
        return provider.verificarDescendenteDaRaiz(refreshToken, pasta);
      });
    if (!dentroDaRaiz || pasta.trashed
        || pasta.mimeType !== "application/vnd.google-apps.folder") {
      throw new AppError("Pasta fora do acervo autorizado", 403, "PASTA_FORA_DA_RAIZ");
    }
    return pasta;
  }

  async function exigirArquivoDoAcervo(refreshToken, material, deveEstarNaLixeira) {
    await exigirPastaDoAcervo(refreshToken, material.categoriaDriveId);
    const item = await executarGoogle(function obterArquivo() {
      return provider.obterItem(refreshToken, material.driveFileId);
    });
    const paiCorreto = Array.isArray(item.parents)
      && item.parents.includes(material.categoriaDriveId);
    const lixeiraCorreta = deveEstarNaLixeira ? item.trashed : !item.trashed;
    if (!paiCorreto || !lixeiraCorreta || item.mimeType === "application/vnd.google-apps.shortcut") {
      throw new AppError("Material fora do acervo autorizado", 403, "MATERIAL_FORA_DA_RAIZ");
    }
    if (!deveEstarNaLixeira) {
      const dentroDaRaiz = await executarGoogle(function verificarArquivo() {
        return provider.verificarDescendenteDaRaiz(refreshToken, item);
      });
      if (!dentroDaRaiz) {
        throw new AppError("Material fora do acervo autorizado", 403, "MATERIAL_FORA_DA_RAIZ");
      }
    }
    return item;
  }

  async function exigirCategoria(usuario, categoriaId) {
    const categoria = await repository.buscarCategoria(categoriaId);
    if (!categoria || !categoria.ativo || !categoria.drivePastaId) throw new AppError("Pasta indisponivel",404,"PASTA_NAO_ENCONTRADA");
    if (usuario.papel === "professor" && !await repository.professorPodeAcessarCategoria(usuario.id,categoriaId)) {
      throw new AppError("Voce nao pode gerenciar esta pasta",403,"SEM_PERMISSAO_PASTA");
    }
    return categoria;
  }

  async function exigirMaterial(usuario, materialId, estados) {
    const material = await repository.buscarMaterial(materialId);
    if (!material || !estados.includes(material.estado)) throw new AppError("Material nao encontrado",404,"MATERIAL_NAO_ENCONTRADO");
    if (usuario.papel === "professor") await exigirCategoria(usuario,material.categoriaId);
    return material;
  }

  function tratarConcorrencia(erro) {
    if (erro.message === "CONCORRENCIA_MATERIAL") throw new AppError("O material foi alterado por outra pessoa. Atualize a pagina",409,"MATERIAL_ALTERADO");
    throw erro;
  }

  async function executarComTravaDeOperacao(tarefa, arquivoTemporario) {
    let conexao;
    try {
      conexao = await repository.adquirirTravaDeOperacao();
    } catch (erro) {
      if (arquivoTemporario && arquivoTemporario.path) {
        await fs.unlink(arquivoTemporario.path).catch(function ignorar() {});
      }
      throw erro;
    }
    if (!conexao) {
      if (arquivoTemporario && arquivoTemporario.path) {
        await fs.unlink(arquivoTemporario.path).catch(function ignorar() {});
      }
      throw new AppError(
        "Outra operacao do Google Drive esta em andamento. Tente novamente",
        409,
        "GOOGLE_DRIVE_OPERACAO_CONCORRENTE"
      );
    }
    try {
      return await tarefa();
    } finally {
      await repository.liberarTravaDeOperacao(conexao);
    }
  }

  async function executarGoogle(tarefa) {
    try { return await tarefa(); } catch (erro) {
      if (erro.codigo === "GOOGLE_AUTORIZACAO_INVALIDA") await integracaoService.registrarFalhaDeAutorizacao(erro.codigo);
      throw erro;
    }
  }

  function dadosDoDrive(item, dados, categoria) {
    return {
      driveFileId:item.id,driveParentFileId:categoria.drivePastaId,categoriaId:categoria.id,
      disciplinaId:dados.disciplinaId,concursoId:dados.concursoId,nome:item.name || dados.nome,
      mimeType:item.mimeType || dados.mimeType,tipo:dados.tipo,extensao:dados.extensao,
      tamanhoBytes:item.size === undefined ? dados.tamanho : Number(item.size),checksumMd5:item.md5Checksum || null,
      driveCriadoEm:item.createdTime ? new Date(item.createdTime) : null,driveModificadoEm:item.modifiedTime ? new Date(item.modifiedTime) : null,
      resourceKey:item.resourceKey || null
    };
  }

  async function adicionar(usuario, corpo, arquivo) {
    try {
      exigirPapelDeGestao(usuario);
      const dados = await validarUpload(corpo || {},arquivo,configuracao);
      const categoria = await exigirCategoria(usuario,dados.categoriaId);
      const refreshToken = await token();
      await exigirPastaDoAcervo(refreshToken, categoria.drivePastaId);
      const item = await executarGoogle(function enviar() { return provider.criarArquivo(refreshToken,{nome:dados.nome,mimeType:dados.mimeType,tamanho:arquivo.size,caminho:arquivo.path,pastaDriveId:categoria.drivePastaId}); });
      try { return publicar(await repository.criarMaterial(dadosDoDrive(item,Object.assign({},dados,{tamanho:arquivo.size}),categoria),usuario.id)); }
      catch (erroBanco) {
        try { await provider.excluirArquivo(refreshToken,item.id); } catch (erroCompensacao) { /* registrado pelo erro principal sem expor dados */ }
        throw erroBanco;
      }
    } finally { if (arquivo && arquivo.path) await fs.unlink(arquivo.path).catch(function ignorar() {}); }
  }

  async function editar(usuario, materialIdInformado, corpo) {
    exigirPapelDeGestao(usuario);
    const id = inteiroPositivo(materialIdInformado,"Material");
    const dados = validarEdicao(corpo || {});
    const material = await exigirMaterial(usuario,id,["disponivel"]);
    const refreshToken = await token();
    await exigirArquivoDoAcervo(refreshToken, material, false);
    let renomeado = false;
    if (dados.nome !== undefined && dados.nome !== material.nome) {
      await executarGoogle(function renomear() { return provider.renomearArquivo(refreshToken,material.driveFileId,dados.nome); });
      renomeado = true;
    }
    const campos = {};
    if (dados.nome !== undefined) campos.nome=dados.nome;
    if (dados.disciplinaId !== undefined) campos.disciplinaId=dados.disciplinaId;
    if (dados.concursoId !== undefined) campos.concursoId=dados.concursoId;
    try { return publicar(await repository.atualizarMaterial(id,dados.versao,campos,usuario.id,"edicao")); }
    catch (erro) {
      if (renomeado) await provider.renomearArquivo(refreshToken,material.driveFileId,material.nome).catch(function ignorar() {});
      tratarConcorrencia(erro);
    }
  }

  async function mover(usuario, materialIdInformado, corpo) {
    exigirPapelDeGestao(usuario);
    const id=inteiroPositivo(materialIdInformado,"Material"); const dados=validarMovimentacao(corpo||{});
    const material=await exigirMaterial(usuario,id,["disponivel"]);
    const destino=await exigirCategoria(usuario,dados.categoriaId);
    if (material.categoriaId===destino.id) throw new AppError("O material ja esta nesta pasta",400,"DESTINO_IGUAL_ORIGEM");
    const refreshToken=await token();
    await exigirArquivoDoAcervo(refreshToken,material,false);
    await exigirPastaDoAcervo(refreshToken,destino.drivePastaId);
    await executarGoogle(function moverDrive(){return provider.moverArquivo(refreshToken,material.driveFileId,material.categoriaDriveId,destino.drivePastaId);});
    try { return publicar(await repository.atualizarMaterial(id,dados.versao,{categoriaId:destino.id,driveParentFileId:destino.drivePastaId},usuario.id,"movimentacao")); }
    catch(erro){await provider.moverArquivo(refreshToken,material.driveFileId,destino.drivePastaId,material.categoriaDriveId).catch(function ignorar(){});tratarConcorrencia(erro);}
  }

  async function substituir(usuario, materialIdInformado, corpo, arquivo) {
    try {
      exigirPapelDeGestao(usuario);
      const id=inteiroPositivo(materialIdInformado,"Material");
      const material=await exigirMaterial(usuario,id,["disponivel"]);
      const versao=validarVersao(corpo || {});
      const detectado=await identificarArquivo(arquivo,configuracao);
      const refreshToken=await token();
      await exigirArquivoDoAcervo(refreshToken,material,false);
      const novo=await executarGoogle(function enviar(){return provider.criarArquivo(refreshToken,{nome:material.nome.replace(/\.[^.]+$/, "."+detectado.extensao),mimeType:detectado.mimeType,tamanho:arquivo.size,caminho:arquivo.path,pastaDriveId:material.categoriaDriveId});});
      try { await provider.alterarLixeira(refreshToken,material.driveFileId,true); }
      catch(erro){await provider.excluirArquivo(refreshToken,novo.id).catch(function ignorar(){});throw erro;}
      try { return publicar(await repository.atualizarMaterial(id,versao,{driveFileId:novo.id,driveParentFileId:material.categoriaDriveId,nome:novo.name,mimeType:novo.mimeType,tipo:detectado.tipo,extensao:detectado.extensao,tamanhoBytes:Number(novo.size||arquivo.size),checksumMd5:novo.md5Checksum||null,driveModificadoEm:novo.modifiedTime?new Date(novo.modifiedTime):null,resourceKey:novo.resourceKey||null},usuario.id,"substituicao")); }
      catch(erro){await provider.alterarLixeira(refreshToken,material.driveFileId,false).catch(function ignorar(){});await provider.excluirArquivo(refreshToken,novo.id).catch(function ignorar(){});tratarConcorrencia(erro);}
    } finally { if(arquivo&&arquivo.path) await fs.unlink(arquivo.path).catch(function ignorar(){}); }
  }

  async function enviarLixeira(usuario, materialIdInformado, corpo) {
    exigirPapelDeGestao(usuario); const id=inteiroPositivo(materialIdInformado,"Material");
    const material=await exigirMaterial(usuario,id,["disponivel"]); const versao=validarVersao(corpo || {}); const refreshToken=await token();await exigirArquivoDoAcervo(refreshToken,material,false);
    await executarGoogle(function lixeira(){return provider.alterarLixeira(refreshToken,material.driveFileId,true);});
    try{await repository.enviarLixeira(id,versao,usuario.id);return{enviado:true};}catch(erro){await provider.alterarLixeira(refreshToken,material.driveFileId,false).catch(function ignorar(){});tratarConcorrencia(erro);}
  }

  async function listarLixeira(usuario){if(usuario.papel!=="admin")throw new AppError("Usuario sem permissao",403,"SEM_PERMISSAO");return repository.listarLixeira();}
  async function restaurar(usuario,idInformado,corpo){if(usuario.papel!=="admin")throw new AppError("Usuario sem permissao",403,"SEM_PERMISSAO");const id=inteiroPositivo(idInformado,"Material");const versao=validarVersao(corpo || {});const material=await exigirMaterial(usuario,id,["lixeira"]);const categoria=await exigirCategoria(usuario,material.categoriaAnteriorId);material.categoriaDriveId=categoria.drivePastaId;const refreshToken=await token();await exigirArquivoDoAcervo(refreshToken,material,true);await executarGoogle(function restaurarDrive(){return provider.alterarLixeira(refreshToken,material.driveFileId,false);});try{await repository.restaurar(id,versao,usuario.id);return{restaurado:true};}catch(erro){await provider.alterarLixeira(refreshToken,material.driveFileId,true).catch(function ignorar(){});tratarConcorrencia(erro);}}
  async function excluirDefinitivamente(usuario,idInformado,corpo){if(usuario.papel!=="admin")throw new AppError("Usuario sem permissao",403,"SEM_PERMISSAO");const id=inteiroPositivo(idInformado,"Material");const versao=validarVersao(corpo || {});const material=await exigirMaterial(usuario,id,["lixeira","exclusao_pendente"]);const categoria=await exigirCategoria(usuario,material.categoriaAnteriorId);material.categoriaDriveId=categoria.drivePastaId;const refreshToken=await token();await exigirArquivoDoAcervo(refreshToken,material,true);let pendente=material;let marcadaAgora=false;if(material.estado==="lixeira"){try{pendente=await repository.marcarExclusao(id,versao,usuario.id);marcadaAgora=true;}catch(erro){tratarConcorrencia(erro);}}try{await executarGoogle(function excluir(){return provider.excluirArquivo(refreshToken,pendente.driveFileId);});}catch(erro){if(erro.codigo!=="GOOGLE_ARQUIVO_NAO_ENCONTRADO"){if(marcadaAgora)await repository.reverterExclusao(id);throw erro;}}await repository.concluirExclusao(id,usuario.id);return{excluido:true};}
  async function listarPastas(usuario){exigirPapelDeGestao(usuario);return repository.listarPastasGerenciaveis(usuario);}

  return {
    adicionar: function adicionarComTrava(usuario, corpo, arquivo) {
      return executarComTravaDeOperacao(function executar() { return adicionar(usuario, corpo, arquivo); }, arquivo);
    },
    editar: function editarComTrava(usuario, id, corpo) {
      return executarComTravaDeOperacao(function executar() { return editar(usuario, id, corpo); });
    },
    mover: function moverComTrava(usuario, id, corpo) {
      return executarComTravaDeOperacao(function executar() { return mover(usuario, id, corpo); });
    },
    substituir: function substituirComTrava(usuario, id, corpo, arquivo) {
      return executarComTravaDeOperacao(function executar() { return substituir(usuario, id, corpo, arquivo); }, arquivo);
    },
    enviarLixeira: function lixeiraComTrava(usuario, id, corpo) {
      return executarComTravaDeOperacao(function executar() { return enviarLixeira(usuario, id, corpo); });
    },
    listarLixeira: listarLixeira,
    restaurar: function restaurarComTrava(usuario, id, corpo) {
      return executarComTravaDeOperacao(function executar() { return restaurar(usuario, id, corpo); });
    },
    excluirDefinitivamente: function excluirComTrava(usuario, id, corpo) {
      return executarComTravaDeOperacao(function executar() { return excluirDefinitivamente(usuario, id, corpo); });
    },
    listarPastas: listarPastas
  };
}

module.exports = criarGestaoMateriaisService;
