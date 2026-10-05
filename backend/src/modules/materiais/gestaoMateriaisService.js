const fs = require("node:fs/promises");
const crypto = require("node:crypto");
const AppError = require("../../shared/errors/AppError");
const { ESCOPO_GESTAO } = require("../../shared/providers/googleDriveProvider");
const { inteiroPositivo, validarUpload, validarEdicao, validarMovimentacao, validarVersao, identificarArquivo } = require("./gestaoMateriaisValidator");

function criarGestaoMateriaisService(dependencias) {
  const repository = dependencias.repository;
  const provider = dependencias.provider;
  const integracaoService = dependencias.integracaoService;
  const configuracao = dependencias.configuracao;
  const logger = dependencias.logger;
  let temporizadorDeRetomada = null;

  async function iniciarOperacaoDrive(tipo, usuarioId, materialId, detalhes) {
    if (typeof repository.criarOperacaoDrive !== "function") return null;
    const chave = crypto.randomUUID();
    await repository.criarOperacaoDrive({ chave:chave,tipo:tipo,usuarioId:usuarioId,materialId:materialId,detalhes:detalhes });
    return chave;
  }

  async function atualizarOperacaoDrive(chave, fase, detalhes, materialId) {
    if (chave && typeof repository.atualizarOperacaoDrive === "function") {
      await repository.atualizarOperacaoDrive(chave,fase,detalhes,materialId);
    }
  }

  async function concluirOperacaoDrive(chave) {
    if (chave && typeof repository.concluirOperacaoDrive === "function") {
      await repository.concluirOperacaoDrive(chave);
    }
  }

  async function deixarOperacaoPendente(chave, fase, erro, detalhes) {
    if (chave && typeof repository.registrarFalhaOperacaoDrive === "function") {
      await repository.registrarFalhaOperacaoDrive(
        chave,
        fase,
        erro && (erro.codigo || erro.code || erro.message),
        detalhes
      ).catch(function preservarErroOriginal() {});
    }
  }

  async function tratarFalhaDepoisDoDrive(chave, erro, detalhes, compensar) {
    if (erro.estadoCommit === "desconhecido") {
      await deixarOperacaoPendente(chave,"commit_incerto",erro,detalhes);
      tratarConcorrencia(erro);
    }
    try {
      await compensar();
      await concluirOperacaoDrive(chave);
    } catch (erroCompensacao) {
      await deixarOperacaoPendente(chave,"compensacao_pendente",erroCompensacao,detalhes);
    }
    tratarConcorrencia(erro);
  }

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

  function validarNomePasta(corpo) {
    if (!corpo || Object.keys(corpo).some(function invalido(chave) { return !["nome", "categoriaPaiId", "descricao", "ordem"].includes(chave); })) {
      throw new AppError("Campos de pasta invalidos",400,"DADOS_INVALIDOS");
    }
    const nome = typeof corpo.nome === "string" ? corpo.nome.trim() : "";
    if (!nome || nome.length > 120 || /[\x00-\x1f\\/:*?"<>|]/.test(nome) || nome === "." || nome === "..") {
      throw new AppError("Nome de pasta invalido",400,"NOME_PASTA_INVALIDO");
    }
    return nome;
  }

  async function criarPasta(usuario, corpo) {
    exigirPapelDeGestao(usuario);
    const nome = validarNomePasta(corpo);
    const { validarCategoria } = require("../categorias/estruturaAcervoValidator");
    const dados = validarCategoria(corpo, false);
    const categoriaPaiId = dados.categoriaPaiId;
    const concederGestaoAoCriador = categoriaPaiId === null && usuario.papel === "professor";
    const pai = categoriaPaiId === null ? { id: null, drivePastaId: provider.pastaRaizId } : await exigirCategoria(usuario,categoriaPaiId);
    // exigirCategoria ja valida gestao por pasta/ancestral OU disciplina autorizada.
    const refreshToken = await token();
    await exigirPastaDoAcervo(refreshToken,pai.drivePastaId);
    const detalhes = {nome:nome,categoriaPaiId:pai.id,pastaPaiDriveId:pai.drivePastaId,descricao:dados.descricao,ordem:dados.ordem,concederGestaoAoCriador};
    const operacao = await iniciarOperacaoDrive("pasta_criacao",usuario.id,null,detalhes);
    let criada;
    try {
      criada = await executarGoogle(function criarNoDrive() { return provider.criarPasta(refreshToken,nome,pai.drivePastaId,operacao); });
      detalhes.driveFileId = criada.id;
      await atualizarOperacaoDrive(operacao,"drive_confirmado",detalhes);
    } catch (erro) {
      await deixarOperacaoPendente(operacao,"reconciliacao_pendente",erro,detalhes);
      throw erro;
    }
    try { return await repository.criarPasta({...dados,nome:criada.name || nome,categoriaPaiId:pai.id,drivePastaId:criada.id,concederGestaoAoCriador},usuario.id,operacao); }
    catch (erro) {
      return tratarFalhaDepoisDoDrive(operacao,erro,detalhes,function removerPastaNova() { return provider.excluirArquivo(refreshToken,criada.id); });
    }
  }

  async function vincularPasta(usuario, idInformado) {
    if (!usuario || usuario.papel !== "admin") throw new AppError("Somente admin pode vincular pastas",403,"SEM_PERMISSAO");
    const id = inteiroPositivo(idInformado,"Pasta");
    const categoria = await repository.buscarCategoria(id);
    if (!categoria) throw new AppError("Pasta indisponivel",404,"PASTA_NAO_ENCONTRADA");
    if (categoria.drivePastaId) {
      if (categoria.ativo) return {id:categoria.id};
      const pai = categoria.categoriaPaiId === null
        ? {drivePastaId:provider.pastaRaizId}
        : await exigirCategoria(usuario,categoria.categoriaPaiId);
      const refreshToken = await token();
      const pasta = await exigirPastaDoAcervo(refreshToken,categoria.drivePastaId);
      if (!Array.isArray(pasta.parents) || !pasta.parents.includes(pai.drivePastaId)) {
        throw new AppError("Pasta movida no Drive; sincronize o acervo antes de reativar",409,"PASTA_MOVIMENTADA");
      }
      return repository.reativarPastaVinculada(categoria,usuario.id);
    }
    if (!categoria.ativo) throw new AppError("Pasta indisponivel",404,"PASTA_NAO_ENCONTRADA");
    if (await repository.possuiVinculacaoPendente(id)) throw new AppError("Vinculacao em recuperacao. Aguarde a reconciliacao",409,"VINCULACAO_PENDENTE");
    validarNomePasta({nome:categoria.nome});
    const pai = categoria.categoriaPaiId === null ? {drivePastaId:provider.pastaRaizId} : await exigirCategoria(usuario,categoria.categoriaPaiId);
    const refreshToken = await token();
    await exigirPastaDoAcervo(refreshToken,pai.drivePastaId);
    const candidatas = await executarGoogle(() => provider.buscarPastasPorNome(refreshToken,pai.drivePastaId,categoria.nome));
    if (candidatas.length > 1) throw new AppError("Mais de uma pasta com esse nome no Drive. Revise antes de vincular",409,"PASTA_DRIVE_AMBIGUA");
    if (candidatas.length && await repository.buscarCategoriaPorDriveId(candidatas[0].id)) throw new AppError("Pasta do Drive ja vinculada a outro cadastro",409,"PASTA_DRIVE_JA_VINCULADA");
    const detalhes = {nome:categoria.nome,categoriaPaiId:categoria.categoriaPaiId,pastaPaiDriveId:pai.drivePastaId,categoriaExistenteId:id,preexistente:!!candidatas.length};
    if (candidatas.length) detalhes.driveFileId = candidatas[0].id;
    const operacao = await iniciarOperacaoDrive("pasta_criacao",usuario.id,null,detalhes);
    let criada;
    try {
      criada = candidatas[0] || await executarGoogle(() => provider.criarPasta(refreshToken,categoria.nome,pai.drivePastaId,operacao));
      detalhes.driveFileId = criada.id;
      await atualizarOperacaoDrive(operacao,"drive_confirmado",detalhes);
    } catch (erro) {
      await deixarOperacaoPendente(operacao,"reconciliacao_pendente",erro,detalhes);
      throw erro;
    }
    try { return await repository.criarPasta({nome:categoria.nome,categoriaPaiId:categoria.categoriaPaiId,drivePastaId:criada.id,categoriaExistenteId:id},usuario.id,operacao); }
    catch (erro) {
      return tratarFalhaDepoisDoDrive(operacao,erro,detalhes,async () => { if (!detalhes.preexistente) await provider.excluirArquivo(refreshToken,criada.id); });
    }
  }

  async function solicitarExclusaoPasta(usuario, idInformado) {
    if (!usuario || usuario.papel !== "professor") throw new AppError("Somente professores podem solicitar esta exclusão.",403,"SEM_PERMISSAO");
    const categoria = await exigirCategoria(usuario,inteiroPositivo(idInformado,"Pasta"));
    if (!await repository.professorPodeExcluirSubarvore(usuario.id,categoria.id)) {
      throw new AppError("Esta pasta contém subpastas fora da sua permissão. Peça a um administrador para revisar a exclusão.",403,"SEM_PERMISSAO_SUBARVORE");
    }
    if (categoria.drivePastaId === provider.pastaRaizId) throw new AppError("A raiz do acervo e protegida",403,"RAIZ_PROTEGIDA");
    return repository.solicitarExclusaoPasta(categoria,usuario.id);
  }

  async function decidirExclusaoPasta(usuario, idInformado, corpo) {
    if (!usuario || usuario.papel !== "admin") throw new AppError("Somente administradores podem analisar solicitações.",403,"SEM_PERMISSAO");
    if (!corpo || Object.keys(corpo).some(chave=>chave!=="decisao") || !["aprovar","recusar"].includes(corpo.decisao)) throw new AppError("Escolha aprovar ou recusar.",400,"DADOS_INVALIDOS");
    const id=inteiroPositivo(idInformado,"Solicitação");
    const pedido=await repository.buscarSolicitacaoExclusao(id);
    if (!pedido) throw new AppError("Solicitação não encontrada.",404,"SOLICITACAO_NAO_ENCONTRADA");
    if (pedido.estado!=="pendente") throw new AppError("Esta solicitação já foi analisada.",409,"SOLICITACAO_JA_DECIDIDA");
    if (corpo.decisao==="recusar") return repository.recusarExclusaoPasta(id,usuario.id);
    const categoria=await repository.buscarCategoria(pedido.categoria_id);
    if (!categoria || !categoria.ativo || categoria.drivePastaId!==pedido.drive_pasta_id || categoria.nome!==pedido.pasta_nome || categoria.categoriaPaiId!==(pedido.categoria_pai_id===null?null:Number(pedido.categoria_pai_id))) throw new AppError("A pasta mudou desde a solicitação. Recuse este pedido e peça uma nova solicitação.",409,"SOLICITACAO_DESATUALIZADA");
    if (!pedido.ativo || pedido.papel!=="professor" || !await repository.professorPodeExcluirSubarvore(Number(pedido.solicitante_id),categoria.id)) throw new AppError("O professor não tem mais permissão sobre toda a pasta. Recuse a solicitação e revise os acessos.",403,"SEM_PERMISSAO_SUBARVORE");
    return excluirPasta(usuario,categoria.id,id);
  }

  async function excluirPasta(usuario, idInformado, solicitacaoId) {
    if (!usuario || usuario.papel !== "admin") throw new AppError("A exclusão de pastas precisa de aprovação de um administrador.",403,"SEM_PERMISSAO");
    const categoria = await exigirCategoria(usuario,inteiroPositivo(idInformado,"Pasta"));
    if (categoria.drivePastaId === provider.pastaRaizId) throw new AppError("A raiz do acervo e protegida",403,"RAIZ_PROTEGIDA");
    const refreshToken = await token();
    await exigirPastaDoAcervo(refreshToken,categoria.drivePastaId);
    const detalhes = {categoriaId:categoria.id,driveFileId:categoria.drivePastaId,solicitacaoId:solicitacaoId || null};
    const operacao = await iniciarOperacaoDrive("pasta_lixeira",usuario.id,null,detalhes);
    try {
      await executarGoogle(function enviar() { return provider.alterarLixeira(refreshToken,categoria.drivePastaId,true); });
      await atualizarOperacaoDrive(operacao,"drive_confirmado",detalhes);
    } catch (erro) {
      await deixarOperacaoPendente(operacao,"reconciliacao_pendente",erro,detalhes);
      throw erro;
    }
    try { return await repository.excluirPastaComConteudo(categoria,usuario.id,operacao,solicitacaoId); }
    catch (erro) {
      return tratarFalhaDepoisDoDrive(operacao,erro,detalhes,function restaurarPasta() { return provider.alterarLixeira(refreshToken,categoria.drivePastaId,false); });
    }
  }

  async function renomearPasta(usuario, idInformado, corpo) {
    exigirPapelDeGestao(usuario);
    const id = inteiroPositivo(idInformado,"Pasta");
    if (!corpo || Object.keys(corpo).some(function invalido(chave) { return chave !== "nome"; })) throw new AppError("Campos de pasta invalidos",400,"DADOS_INVALIDOS");
    const nome = validarNomePasta(corpo);
    const categoria = await exigirCategoria(usuario,id);
    if (categoria.drivePastaId === provider.pastaRaizId) throw new AppError("A raiz do acervo e protegida",403,"RAIZ_PROTEGIDA");
    if (nome === categoria.nome) return {id:categoria.id,nome:categoria.nome,categoriaPaiId:categoria.categoriaPaiId};
    const pai = categoria.categoriaPaiId === null ? null : await repository.buscarCategoria(categoria.categoriaPaiId);
    if (categoria.categoriaPaiId !== null && (!pai || !pai.ativo || !pai.drivePastaId)) throw new AppError("Pasta pai indisponivel",409,"PASTA_PAI_INDISPONIVEL");
    const paiDriveId = pai ? pai.drivePastaId : provider.pastaRaizId;
    const refreshToken = await token();
    const item = await exigirPastaDoAcervo(refreshToken,categoria.drivePastaId);
    if (!Array.isArray(item.parents) || !item.parents.includes(paiDriveId)) throw new AppError("Pasta movida no Drive; atualize o acervo",409,"PASTA_MOVIMENTADA");
    const detalhes = {categoriaId:id,driveFileId:categoria.drivePastaId,nomeAnterior:categoria.nome,nomeNovo:nome};
    const operacao = await iniciarOperacaoDrive("pasta_renomeacao",usuario.id,null,detalhes);
    try {
      await executarGoogle(function renomearNoDrive() { return provider.renomearArquivo(refreshToken,categoria.drivePastaId,nome); });
      await atualizarOperacaoDrive(operacao,"drive_confirmado",detalhes);
    } catch (erro) {
      await deixarOperacaoPendente(operacao,"reconciliacao_pendente",erro,detalhes);
      throw erro;
    }
    try { return await repository.renomearPasta(categoria,nome,usuario.id,operacao); }
    catch (erro) {
      return tratarFalhaDepoisDoDrive(operacao,erro,detalhes,function restaurarNome() { return provider.renomearArquivo(refreshToken,categoria.drivePastaId,categoria.nome); });
    }
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
      if (usuario.papel === "professor" && dados.disciplinaId !== null) {
        const disciplinaEfetiva = await repository.buscarDisciplinaEfetiva(categoria.id);
        if (dados.disciplinaId !== disciplinaEfetiva) throw new AppError("Disciplina diferente da pasta",403,"SEM_PERMISSAO_DISCIPLINA");
      }
      const refreshToken = await token();
      await exigirPastaDoAcervo(refreshToken, categoria.drivePastaId);
      const detalhes = { nome:dados.nome,categoriaId:categoria.id,categoriaDriveId:categoria.drivePastaId };
      const operacao = await iniciarOperacaoDrive("upload",usuario.id,null,detalhes);
      let item;
      try {
        item = await executarGoogle(function enviar() { return provider.criarArquivo(refreshToken,{nome:dados.nome,mimeType:dados.mimeType,tamanho:arquivo.size,caminho:arquivo.path,pastaDriveId:categoria.drivePastaId,operacaoChave:operacao}); });
        detalhes.driveFileId = item.id;
        await atualizarOperacaoDrive(operacao,"drive_confirmado",detalhes);
      } catch (erroDrive) {
        await deixarOperacaoPendente(operacao,"reconciliacao_pendente",erroDrive,detalhes);
        throw erroDrive;
      }
      try {
        const criado = await repository.criarMaterial(dadosDoDrive(item,Object.assign({},dados,{tamanho:arquivo.size}),categoria),usuario.id,operacao);
        return publicar(criado);
      }
      catch (erroBanco) {
        return await tratarFalhaDepoisDoDrive(operacao,erroBanco,detalhes,function compensarUpload() {
          return provider.excluirArquivo(refreshToken,item.id);
        });
      }
    } finally { if (arquivo && arquivo.path) await fs.unlink(arquivo.path).catch(function ignorar() {}); }
  }

  async function editar(usuario, materialIdInformado, corpo) {
    exigirPapelDeGestao(usuario);
    const id = inteiroPositivo(materialIdInformado,"Material");
    const dados = validarEdicao(corpo || {});
    if (usuario.papel === "professor" && dados.disciplinaId !== undefined) throw new AppError("Professor nao pode alterar a disciplina do material",403,"SEM_PERMISSAO_DISCIPLINA");
    const material = await exigirMaterial(usuario,id,["disponivel"]);
    const refreshToken = await token();
    await exigirArquivoDoAcervo(refreshToken, material, false);
    let renomeado = false;
    let operacao = null;
    const detalhes = { driveFileId:material.driveFileId,nomeAnterior:material.nome,nomeNovo:dados.nome };
    if (dados.nome !== undefined && dados.nome !== material.nome) {
      operacao = await iniciarOperacaoDrive("edicao",usuario.id,material.id,detalhes);
      try {
        await executarGoogle(function renomear() { return provider.renomearArquivo(refreshToken,material.driveFileId,dados.nome); });
        await atualizarOperacaoDrive(operacao,"drive_confirmado",detalhes,material.id);
      } catch (erroDrive) {
        await deixarOperacaoPendente(operacao,"reconciliacao_pendente",erroDrive,detalhes);
        throw erroDrive;
      }
      renomeado = true;
    }
    const campos = {};
    if (dados.nome !== undefined) campos.nome=dados.nome;
    if (dados.disciplinaId !== undefined) campos.disciplinaId=dados.disciplinaId;
    if (dados.concursoId !== undefined) campos.concursoId=dados.concursoId;
    try {
      const atualizado = await repository.atualizarMaterial(id,dados.versao,campos,usuario.id,"edicao",operacao);
      return publicar(atualizado);
    }
    catch (erro) {
      if (renomeado) {
        return tratarFalhaDepoisDoDrive(operacao,erro,detalhes,function compensarRenomeacao() {
          return provider.renomearArquivo(refreshToken,material.driveFileId,material.nome);
        });
      }
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
    const detalhes={driveFileId:material.driveFileId,pastaAnteriorDriveId:material.categoriaDriveId,pastaNovaDriveId:destino.drivePastaId};
    const operacao=await iniciarOperacaoDrive("movimentacao",usuario.id,material.id,detalhes);
    try{await executarGoogle(function moverDrive(){return provider.moverArquivo(refreshToken,material.driveFileId,material.categoriaDriveId,destino.drivePastaId);});await atualizarOperacaoDrive(operacao,"drive_confirmado",detalhes,material.id);}
    catch(erroDrive){await deixarOperacaoPendente(operacao,"reconciliacao_pendente",erroDrive,detalhes);throw erroDrive;}
    try { const atualizado=await repository.atualizarMaterial(id,dados.versao,{categoriaId:destino.id,driveParentFileId:destino.drivePastaId},usuario.id,"movimentacao",operacao);return publicar(atualizado); }
    catch(erro){return tratarFalhaDepoisDoDrive(operacao,erro,detalhes,function compensarMovimento(){return provider.moverArquivo(refreshToken,material.driveFileId,destino.drivePastaId,material.categoriaDriveId);});}
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
      const detalhes={driveFileIdAnterior:material.driveFileId,categoriaDriveId:material.categoriaDriveId};
      const operacao=await iniciarOperacaoDrive("substituicao",usuario.id,material.id,detalhes);
      let novo;
      try {
        novo=await executarGoogle(function enviar(){return provider.criarArquivo(refreshToken,{nome:material.nome.replace(/\.[^.]+$/, "."+detectado.extensao),mimeType:detectado.mimeType,tamanho:arquivo.size,caminho:arquivo.path,pastaDriveId:material.categoriaDriveId,operacaoChave:operacao});});
        detalhes.driveFileIdNovo=novo.id;
        await atualizarOperacaoDrive(operacao,"drive_confirmado",detalhes,material.id);
        await executarGoogle(function arquivarAnterior(){return provider.alterarLixeira(refreshToken,material.driveFileId,true);});
      } catch(erroDrive) {
        await deixarOperacaoPendente(operacao,"reconciliacao_pendente",erroDrive,detalhes);
        throw erroDrive;
      }
      try {
        const atualizado=await repository.atualizarMaterial(id,versao,{driveFileId:novo.id,driveParentFileId:material.categoriaDriveId,nome:novo.name,mimeType:novo.mimeType,tipo:detectado.tipo,extensao:detectado.extensao,tamanhoBytes:Number(novo.size||arquivo.size),checksumMd5:novo.md5Checksum||null,driveModificadoEm:novo.modifiedTime?new Date(novo.modifiedTime):null,resourceKey:novo.resourceKey||null},usuario.id,"substituicao",operacao);
        return publicar(atualizado);
      } catch(erro) {
        return await tratarFalhaDepoisDoDrive(operacao,erro,detalhes,async function compensarSubstituicao(){
          await provider.alterarLixeira(refreshToken,material.driveFileId,false);
          await provider.excluirArquivo(refreshToken,novo.id);
        });
      }
    } finally { if(arquivo&&arquivo.path) await fs.unlink(arquivo.path).catch(function ignorar(){}); }
  }

  async function enviarLixeira(usuario, materialIdInformado, corpo) {
    exigirPapelDeGestao(usuario); const id=inteiroPositivo(materialIdInformado,"Material");
    const material=await exigirMaterial(usuario,id,["disponivel"]); const versao=validarVersao(corpo || {}); const refreshToken=await token();await exigirArquivoDoAcervo(refreshToken,material,false);
    const detalhes={driveFileId:material.driveFileId};const operacao=await iniciarOperacaoDrive("lixeira",usuario.id,material.id,detalhes);
    try{await executarGoogle(function lixeira(){return provider.alterarLixeira(refreshToken,material.driveFileId,true);});await atualizarOperacaoDrive(operacao,"drive_confirmado",detalhes,material.id);}catch(erroDrive){await deixarOperacaoPendente(operacao,"reconciliacao_pendente",erroDrive,detalhes);throw erroDrive;}
    try{await repository.enviarLixeira(id,versao,usuario.id,operacao);return{enviado:true};}catch(erro){return tratarFalhaDepoisDoDrive(operacao,erro,detalhes,function compensarLixeira(){return provider.alterarLixeira(refreshToken,material.driveFileId,false);});}
  }

  async function listarLixeira(usuario){if(usuario.papel!=="admin")throw new AppError("Usuario sem permissao",403,"SEM_PERMISSAO");return repository.listarLixeira();}
  async function restaurar(usuario,idInformado,corpo){
    if(usuario.papel!=="admin")throw new AppError("Usuario sem permissao",403,"SEM_PERMISSAO");
    const id=inteiroPositivo(idInformado,"Material");const versao=validarVersao(corpo || {});const material=await exigirMaterial(usuario,id,["lixeira"]);const categoria=await exigirCategoria(usuario,material.categoriaAnteriorId);material.categoriaDriveId=categoria.drivePastaId;const refreshToken=await token();await exigirArquivoDoAcervo(refreshToken,material,true);
    const detalhes={driveFileId:material.driveFileId};const operacao=await iniciarOperacaoDrive("restauracao",usuario.id,material.id,detalhes);
    try{await executarGoogle(function restaurarDrive(){return provider.alterarLixeira(refreshToken,material.driveFileId,false);});await atualizarOperacaoDrive(operacao,"drive_confirmado",detalhes,material.id);}catch(erroDrive){await deixarOperacaoPendente(operacao,"reconciliacao_pendente",erroDrive,detalhes);throw erroDrive;}
    try{await repository.restaurar(id,versao,usuario.id,operacao);return{restaurado:true};}catch(erro){return tratarFalhaDepoisDoDrive(operacao,erro,detalhes,function compensarRestauracao(){return provider.alterarLixeira(refreshToken,material.driveFileId,true);});}
  }

  async function excluirDefinitivamente(usuario,idInformado,corpo){
    if(usuario.papel!=="admin")throw new AppError("Usuario sem permissao",403,"SEM_PERMISSAO");
    const id=inteiroPositivo(idInformado,"Material");const versao=validarVersao(corpo || {});const material=await exigirMaterial(usuario,id,["lixeira","exclusao_pendente"]);const refreshToken=await token();
    if(material.estado==="lixeira"){
      const categoria=await exigirCategoria(usuario,material.categoriaAnteriorId);material.categoriaDriveId=categoria.drivePastaId;await exigirArquivoDoAcervo(refreshToken,material,true);
    }
    let pendente=material;const detalhes={driveFileId:material.driveFileId};let operacao;
    if(material.estado==="lixeira"){
      operacao=crypto.randomUUID();
      try{pendente=await repository.marcarExclusao(id,versao,usuario.id,{chave:operacao,detalhes:detalhes});}catch(erro){tratarConcorrencia(erro);}
    }else{
      operacao=await iniciarOperacaoDrive("exclusao_definitiva",usuario.id,pendente.id,detalhes);
    }
    try{await executarGoogle(function excluir(){return provider.excluirArquivo(refreshToken,pendente.driveFileId);});await atualizarOperacaoDrive(operacao,"drive_confirmado",detalhes,pendente.id);}catch(erro){if(erro.codigo!=="GOOGLE_ARQUIVO_NAO_ENCONTRADO"){await deixarOperacaoPendente(operacao,"reconciliacao_pendente",erro,detalhes);throw erro;}}
    try{await repository.concluirExclusao(id,usuario.id,operacao);return{excluido:true};}catch(erroBanco){await deixarOperacaoPendente(operacao,erroBanco.estadoCommit==="desconhecido"?"commit_incerto":"reconciliacao_pendente",erroBanco,detalhes);throw erroBanco;}
  }
  async function listarPastas(usuario){exigirPapelDeGestao(usuario);return repository.listarPastasGerenciaveis(usuario);}

  async function obterItemOuNulo(refreshToken, driveFileId) {
    try { return await provider.obterItem(refreshToken,driveFileId); }
    catch (erro) {
      if (erro.codigo === "GOOGLE_ARQUIVO_NAO_ENCONTRADO") return null;
      throw erro;
    }
  }

  async function reconciliarOperacao(refreshToken, operacao) {
    const detalhes=operacao.detalhes || {};
    if (operacao.tipo === "pasta_lixeira") {
      const categoria = await repository.buscarCategoria(detalhes.categoriaId);
      if (!categoria || categoria.drivePastaId !== detalhes.driveFileId || categoria.drivePastaId === provider.pastaRaizId) {
        throw new AppError("Pasta ausente durante reconciliacao",503,"PASTA_RECONCILIACAO_PENDENTE");
      }
      // O estado confirmado no banco decide a compensacao, inclusive em commit incerto.
      await provider.alterarLixeira(refreshToken,categoria.drivePastaId,!categoria.ativo);
      await concluirOperacaoDrive(operacao.chave);
      return;
    }
    if (operacao.tipo === "pasta_criacao") {
      const item = detalhes.driveFileId ? await obterItemOuNulo(refreshToken,detalhes.driveFileId)
        : typeof provider.buscarArquivoPorOperacao === "function" ? await provider.buscarArquivoPorOperacao(refreshToken,operacao.chave) : null;
      if (!item) { await concluirOperacaoDrive(operacao.chave); return; }
      if (item.trashed || item.mimeType !== "application/vnd.google-apps.folder" || !Array.isArray(item.parents) || !item.parents.includes(detalhes.pastaPaiDriveId)) {
        throw new AppError("Pasta externa mudou durante reconciliacao",503,"PASTA_RECONCILIACAO_PENDENTE");
      }
      const existente = await repository.buscarCategoriaPorDriveId(item.id);
      if (!existente) {
        await repository.criarPasta({nome:item.name,categoriaPaiId:detalhes.categoriaPaiId,drivePastaId:item.id,descricao:detalhes.descricao,ordem:detalhes.ordem,categoriaExistenteId:detalhes.categoriaExistenteId,concederGestaoAoCriador:detalhes.concederGestaoAoCriador===true},operacao.usuarioId,operacao.chave);
      } else {
        if (detalhes.categoriaExistenteId && existente.id !== detalhes.categoriaExistenteId) throw new AppError("Pasta vinculada a outro cadastro",409,"PASTA_DRIVE_JA_VINCULADA");
        if (detalhes.concederGestaoAoCriador === true && detalhes.categoriaPaiId === null && existente.categoriaPaiId === null) {
          await repository.concluirCriacaoPrincipalRecuperada(existente.id,operacao.usuarioId,operacao.chave);
        } else await concluirOperacaoDrive(operacao.chave);
      }
      return;
    }
    if (operacao.tipo === "pasta_renomeacao") {
      const categoria = await repository.buscarCategoria(detalhes.categoriaId);
      if (!categoria) throw new AppError("Pasta ausente durante reconciliacao",503,"PASTA_RECONCILIACAO_PENDENTE");
      await provider.renomearArquivo(refreshToken,categoria.drivePastaId,categoria.nome);
      await concluirOperacaoDrive(operacao.chave);
      return;
    }
    const material=operacao.materialId ? await repository.buscarMaterial(operacao.materialId) : null;
    if(operacao.tipo==="exclusao_definitiva"){
      try{await provider.excluirArquivo(refreshToken,detalhes.driveFileId);}catch(erro){if(erro.codigo!=="GOOGLE_ARQUIVO_NAO_ENCONTRADO")throw erro;}
      if(material&&material.estado==="exclusao_pendente")await repository.concluirExclusao(material.id,operacao.usuarioId,operacao.chave);
      else await concluirOperacaoDrive(operacao.chave);return;
    }
    if(operacao.tipo==="upload"){
      if(!detalhes.driveFileId&&typeof provider.buscarArquivoPorOperacao==="function"){
        const encontrado=await provider.buscarArquivoPorOperacao(refreshToken,operacao.chave);
        if(encontrado)detalhes.driveFileId=encontrado.id;
      }
      if(!detalhes.driveFileId){await integracaoService.solicitarSincronizacaoAutomatica();throw new AppError("Upload com resultado externo incerto",503,"GOOGLE_UPLOAD_RESULTADO_INCERTO");}
      if(!material||material.driveFileId!==detalhes.driveFileId){try{await provider.excluirArquivo(refreshToken,detalhes.driveFileId);}catch(erro){if(erro.codigo!=="GOOGLE_ARQUIVO_NAO_ENCONTRADO")throw erro;}}
      await concluirOperacaoDrive(operacao.chave);return;
    }
    if(!material){await concluirOperacaoDrive(operacao.chave);return;}
    if(operacao.tipo==="edicao"){
      await provider.renomearArquivo(refreshToken,material.driveFileId,material.nome);
    }else if(operacao.tipo==="movimentacao"){
      const item=await obterItemOuNulo(refreshToken,material.driveFileId);
      if(!item){await integracaoService.solicitarSincronizacaoAutomatica();throw new AppError("Arquivo ausente durante reconciliacao",503,"GOOGLE_ARQUIVO_NAO_ENCONTRADO");}
      const paiAtual=Array.isArray(item.parents)?item.parents[0]:null;
      if(paiAtual!==material.categoriaDriveId)await provider.moverArquivo(refreshToken,material.driveFileId,paiAtual,material.categoriaDriveId);
    }else if(operacao.tipo==="substituicao"){
      if(!detalhes.driveFileIdNovo&&typeof provider.buscarArquivoPorOperacao==="function"){
        const encontrado=await provider.buscarArquivoPorOperacao(refreshToken,operacao.chave);
        if(encontrado)detalhes.driveFileIdNovo=encontrado.id;
      }
      if(!detalhes.driveFileIdNovo){await integracaoService.solicitarSincronizacaoAutomatica();throw new AppError("Substituicao com resultado externo incerto",503,"GOOGLE_SUBSTITUICAO_RESULTADO_INCERTO");}
      if(material.driveFileId===detalhes.driveFileIdNovo){
        await provider.alterarLixeira(refreshToken,detalhes.driveFileIdAnterior,true);
        await provider.alterarLixeira(refreshToken,detalhes.driveFileIdNovo,false);
      }else{
        await provider.alterarLixeira(refreshToken,detalhes.driveFileIdAnterior,false);
        try{await provider.excluirArquivo(refreshToken,detalhes.driveFileIdNovo);}catch(erro){if(erro.codigo!=="GOOGLE_ARQUIVO_NAO_ENCONTRADO")throw erro;}
      }
    }else if(operacao.tipo==="lixeira"||operacao.tipo==="restauracao"){
      await provider.alterarLixeira(refreshToken,material.driveFileId,material.estado!=="disponivel");
    }
    await concluirOperacaoDrive(operacao.chave);
  }

  async function recuperarOperacoesPendentes() {
    if(typeof repository.listarOperacoesDrivePendentes!=="function"||!provider)return 0;
    const conexao=await repository.adquirirTravaDeOperacao();
    if(!conexao)return 0;
    try{
      const operacoes=await repository.listarOperacoesDrivePendentes(25);
      if(!operacoes.length)return 0;
      const refreshToken=await token();
      let concluidas=0;
      for(const operacao of operacoes){
        try{await reconciliarOperacao(refreshToken,operacao);concluidas+=1;}
        catch(erro){
          await deixarOperacaoPendente(operacao.chave,"reconciliacao_pendente",erro,operacao.detalhes);
          if(logger)logger.warn({operacaoId:operacao.id,materialId:operacao.materialId,codigo:erro.codigo||erro.code||"OPERACAO_DRIVE_PENDENTE"},"Operacao Google Drive continuara pendente");
        }
      }
      return concluidas;
    }finally{await repository.liberarTravaDeOperacao(conexao);}
  }

  function iniciarRetomada() {
    if(temporizadorDeRetomada||!provider)return;
    function registrarFalha(erro){if(logger)logger.warn({codigo:erro.codigo||erro.code||"RETOMADA_DRIVE_FALHOU"},"Retomada de operacoes Google Drive falhou");}
    void recuperarOperacoesPendentes().catch(registrarFalha);
    temporizadorDeRetomada=setInterval(function repetir(){void recuperarOperacoesPendentes().catch(registrarFalha);},configuracao.googleDrive.intervaloChangesMs);
    if(typeof temporizadorDeRetomada.unref==="function")temporizadorDeRetomada.unref();
  }

  function pararRetomada(){if(temporizadorDeRetomada){clearInterval(temporizadorDeRetomada);temporizadorDeRetomada=null;}}

  return {
    comTravaUpload: executarComTravaDeOperacao,
    async autorizarUpload(usuario, dados) {
      exigirPapelDeGestao(usuario);
      const categoria = await exigirCategoria(usuario,dados.categoriaId);
      if (usuario.papel === "professor" && dados.disciplinaId !== null
          && dados.disciplinaId !== await repository.buscarDisciplinaEfetiva(categoria.id)) {
        throw new AppError("Disciplina diferente da pasta",403,"SEM_PERMISSAO_DISCIPLINA");
      }
      const refreshToken = await token();
      await exigirPastaDoAcervo(refreshToken,categoria.drivePastaId);
      return {refreshToken,categoria};
    },
    async concluirUploadRetomavel(usuario, dados, categoria, item, uploadId) {
      return publicar(await repository.criarMaterial(dadosDoDrive(item,dados,categoria),usuario.id,null,uploadId));
    },
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
    listarPastas: listarPastas,
    listarSolicitacoesExclusao: usuario => { exigirPapelDeGestao(usuario); return repository.listarSolicitacoesExclusao(usuario); },
    solicitarExclusaoPasta: (usuario,id) => executarComTravaDeOperacao(()=>solicitarExclusaoPasta(usuario,id)),
    decidirExclusaoPasta: (usuario,id,corpo) => executarComTravaDeOperacao(()=>decidirExclusaoPasta(usuario,id,corpo)),
    vincularPasta: function vincularComTrava(usuario,id) { return executarComTravaDeOperacao(() => vincularPasta(usuario,id)); },
    excluirPasta: function excluirPastaComTrava(usuario,id) { return executarComTravaDeOperacao(function executar() { return excluirPasta(usuario,id); }); },
    criarPasta: function criarPastaComTrava(usuario,corpo) { return executarComTravaDeOperacao(function executar() { return criarPasta(usuario,corpo); }); },
    renomearPasta: function renomearPastaComTrava(usuario,id,corpo) { return executarComTravaDeOperacao(function executar() { return renomearPasta(usuario,id,corpo); }); },
    recuperarOperacoesPendentes: recuperarOperacoesPendentes,
    iniciarRetomada: iniciarRetomada,
    pararRetomada: pararRetomada
  };
}

module.exports = criarGestaoMateriaisService;
