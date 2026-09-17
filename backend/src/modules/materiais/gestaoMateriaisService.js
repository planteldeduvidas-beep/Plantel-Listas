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
    recuperarOperacoesPendentes: recuperarOperacoesPendentes,
    iniciarRetomada: iniciarRetomada,
    pararRetomada: pararRetomada
  };
}

module.exports = criarGestaoMateriaisService;
