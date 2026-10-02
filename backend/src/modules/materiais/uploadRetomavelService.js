const crypto = require("node:crypto");
const AppError = require("../../shared/errors/AppError");
const {identificarAssinatura,validarDadosUpload} = require("./gestaoMateriaisValidator");
const {criptografarRefreshToken:selar,descriptografarRefreshToken:abrir} = require("../../shared/providers/googleDriveProvider");

const CHUNK_BYTES = 4 * 1024 * 1024;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const erro = (mensagem,status,codigo) => new AppError(mensagem,status,codigo);

function criarUploadRetomavelService({repository,gestao,provider,integracaoService,configuracao,logger,relogio = Date.now}) {
  let timer;
  let limpando = false;
  const chave = configuracao.googleDrive.encryptionKey;
  const limiteVideo = configuracao.seguranca.tamanhoMaximoVideoRetomavelBytes || 3072 * 1024 * 1024;
  function validarId(id) { if (!UUID.test(id || "")) throw erro("Sessao de envio invalida",400,"UPLOAD_SESSAO_INVALIDA"); }
  function publicar(s) {
    return {id:s.id,estado:s.estado,recebido:s.recebido,tamanho:s.tamanho,chunkBytes:CHUNK_BYTES,materialId:s.material_id || null};
  }
  function validarInicio(corpo) {
    if (!corpo || Object.keys(corpo).some(k => !["id","arquivo","campos"].includes(k))) throw erro("Dados do envio invalidos",400,"DADOS_INVALIDOS");
    validarId(corpo.id);
    const a = corpo.arquivo;
    if (!a || Object.keys(a).some(k => !["nome","mime","tamanho","assinatura"].includes(k))
        || typeof a.nome !== "string" || typeof a.mime !== "string" || !Number.isSafeInteger(a.tamanho) || a.tamanho < 16
        || typeof a.assinatura !== "string" || !/^[A-Za-z0-9+/]{22}==$/.test(a.assinatura)) {
      throw erro("Arquivo invalido. Selecione um PDF ou video compativel.",400,"ARQUIVO_INVALIDO");
    }
    const assinatura = Buffer.from(a.assinatura,"base64");
    const arquivo = {originalname:a.nome,mimetype:a.mime,size:a.tamanho};
    const detectado = identificarAssinatura(arquivo,{seguranca:{...configuracao.seguranca,tamanhoMaximoVideoBytes:limiteVideo}},assinatura);
    return {...validarDadosUpload(corpo.campos || {},arquivo,detectado),tamanho:a.tamanho,assinatura:a.assinatura};
  }
  async function autorizar(usuario,s) {
    if (!s || s.usuario_id !== usuario.id) throw erro("Sessao de envio nao encontrada",404,"UPLOAD_NAO_ENCONTRADO");
    const contexto = await gestao.autorizarUpload(usuario,s.dados);
    if (contexto.categoria.drivePastaId !== s.dados.pastaDriveId) throw erro("A pasta mudou. Cancele o envio e escolha novamente.",409,"UPLOAD_PASTA_ALTERADA");
    return contexto;
  }
  async function carregar(usuario,id) {
    validarId(id);
    const s = await repository.buscar(id);
    const contexto = await autorizar(usuario,s);
    return {s,...contexto};
  }
  function exigirAtiva(s) {
    if (["cancelado","cancelando"].includes(s.estado)) throw erro("Este envio foi cancelado",410,"UPLOAD_CANCELADO");
    if (new Date(s.expira_em).getTime() <= relogio()) throw erro("Este envio expirou. Selecione o arquivo novamente.",410,"UPLOAD_EXPIRADO");
    if (!s.sessao_criptografada) throw erro("O envio ainda nao foi preparado. Tente novamente.",409,"UPLOAD_PREPARANDO");
  }
  async function iniciar(usuario,corpo) {
    const dados = validarInicio(corpo);
    return gestao.comTravaUpload(async () => {
      const {categoria,refreshToken} = await gestao.autorizarUpload(usuario,dados);
      dados.pastaDriveId = categoria.drivePastaId;
      let s = await repository.buscar(corpo.id);
      if (s) {
        await autorizar(usuario,s);
        if (Object.keys(s.dados).length !== Object.keys(dados).length || Object.keys(dados).some(k => s.dados[k] !== dados[k])) throw erro("Os dados do envio nao podem ser alterados",409,"UPLOAD_DADOS_ALTERADOS");
        if (s.estado !== "preparando") return publicar(s);
        if (new Date(s.expira_em).getTime() <= relogio()) throw erro("Este envio expirou",410,"UPLOAD_EXPIRADO");
      } else {
        const contagem = await repository.contar(usuario.id);
        if (contagem.usuario >= 1 || contagem.total >= 4) throw erro("Ha um envio pendente ou o servidor esta ocupado. Retome ou cancele o envio anterior.",429,"UPLOAD_LIMITE_SESSOES");
        s = {id:corpo.id,usuario_id:usuario.id,dados,tamanho:dados.tamanho,recebido:0,estado:"preparando",drive_id:await provider.reservarIdUpload(refreshToken)};
        await repository.criar(s);
      }
      const url = await provider.iniciarUploadRetomavel(refreshToken,{...dados,driveId:s.drive_id});
      s.sessao_criptografada = selar(url,chave);
      s.estado = "enviando";
      await repository.salvar(s);
      return publicar(s);
    });
  }
  function conferirItem(s,item) {
    if (!item || item.id !== s.drive_id || Number(item.size) !== s.tamanho || item.name !== s.dados.nome
        || item.mimeType !== s.dados.mimeType || item.trashed || !item.parents?.includes(s.dados.pastaDriveId)) {
      throw erro("Nao foi possivel confirmar o arquivo enviado",409,"UPLOAD_ARQUIVO_DIVERGENTE");
    }
  }
  async function consultarDrive(s,refreshToken) {
    let resultado;
    try { resultado = await provider.transferirParteUpload(refreshToken,abrir(s.sessao_criptografada,chave),s.tamanho); }
    catch (falha) {
      if (falha.codigo !== "UPLOAD_EXPIRADO") throw falha;
      // Uma resposta final perdida pode expirar a URI, mas o ID reservado e imutavel.
      let item;
      try { item = await provider.obterItem(refreshToken,s.drive_id); }
      catch (consulta) { if (consulta.codigo === "GOOGLE_ARQUIVO_NAO_ENCONTRADO") throw falha; throw consulta; }
      resultado = {completo:true,recebido:s.tamanho,item};
    }
    if (resultado.completo) conferirItem(s,resultado.item);
    s.recebido = resultado.recebido;
    s.estado = resultado.completo ? "enviado" : "enviando";
    await repository.salvar(s);
    return resultado;
  }
  async function consultar(usuario,id) {
    return gestao.comTravaUpload(async () => {
      const {s,refreshToken} = await carregar(usuario,id);
      if (s.estado === "concluido") return publicar(s);
      exigirAtiva(s);
      await consultarDrive(s,refreshToken);
      return publicar(s);
    });
  }
  async function parte(usuario,id,offset,corpo) {
    if (!Number.isSafeInteger(offset) || offset < 0 || !Buffer.isBuffer(corpo) || !corpo.length || corpo.length > CHUNK_BYTES) throw erro("Parte de envio invalida",400,"UPLOAD_CHUNK_INVALIDO");
    return gestao.comTravaUpload(async () => {
      const {s,refreshToken} = await carregar(usuario,id);
      if (s.estado === "concluido") return publicar(s);
      exigirAtiva(s);
      if (offset + corpo.length > s.tamanho || (offset + corpo.length !== s.tamanho && corpo.length % (256 * 1024))) throw erro("Tamanho da parte invalido",400,"UPLOAD_CHUNK_INVALIDO");
      if (offset === 0 && !corpo.subarray(0,16).equals(Buffer.from(s.dados.assinatura,"base64"))) throw erro("O arquivo selecionado mudou",400,"TIPO_ARQUIVO_INVALIDO");
      const atual = await consultarDrive(s,refreshToken);
      if (atual.completo || offset + corpo.length <= s.recebido) return publicar(s);
      if (offset !== s.recebido) throw erro("O progresso mudou. Consulte o envio para retomar.",409,"UPLOAD_OFFSET_DIVERGENTE");
      const resultado = await provider.transferirParteUpload(refreshToken,abrir(s.sessao_criptografada,chave),s.tamanho,offset,corpo);
      if (resultado.recebido < offset || resultado.recebido > offset + corpo.length) throw erro("Progresso do envio invalido",503,"UPLOAD_PROTOCOLO_INVALIDO");
      if (resultado.completo) conferirItem(s,resultado.item);
      s.recebido = resultado.recebido;
      s.estado = resultado.completo ? "enviado" : "enviando";
      await repository.salvar(s);
      return publicar(s);
    });
  }
  async function finalizar(usuario,id) {
    return gestao.comTravaUpload(async () => {
      const {s,refreshToken,categoria} = await carregar(usuario,id);
      if (s.estado === "concluido") return publicar(s);
      exigirAtiva(s);
      const resultado = await consultarDrive(s,refreshToken);
      if (!resultado.completo) throw erro("O arquivo ainda nao terminou de enviar",409,"UPLOAD_INCOMPLETO");
      // A transacao grava material, auditoria e conclusao da sessao conjuntamente.
      await gestao.concluirUploadRetomavel(usuario,s.dados,categoria,resultado.item,s.id);
      return publicar(await repository.buscar(s.id));
    });
  }
  async function limpar(s,refreshToken) {
    s.estado = "cancelando";
    await repository.salvar(s);
    // ID foi reservado pelo servidor; nunca vem do cliente. Cancelar nao publica material.
    try { await provider.excluirArquivo(refreshToken,s.drive_id); }
    catch (falha) { if (falha.codigo !== "GOOGLE_ARQUIVO_NAO_ENCONTRADO") throw falha; }
    s.estado = "cancelado";
    s.sessao_criptografada = null;
    await repository.salvar(s);
  }
  async function cancelar(usuario,id) {
    return gestao.comTravaUpload(async () => {
      const {s,refreshToken} = await carregar(usuario,id);
      if (s.estado === "concluido") throw erro("Envio ja concluido. Use a lixeira do material.",409,"UPLOAD_CONCLUIDO");
      if (s.estado !== "cancelado") await limpar(s,refreshToken);
      return publicar(s);
    });
  }
  async function autorizarParte(usuario,id) {
    const {s} = await carregar(usuario,id);
    if (s.estado !== "concluido") exigirAtiva(s);
  }
  async function limparAbandonados() {
    if (limpando) return;
    limpando = true;
    try {
      await gestao.comTravaUpload(async () => {
        for (const s of await repository.abandonados()) {
          try { await limpar(s,await integracaoService.obterRefreshTokenParaUso()); }
          catch { await repository.falhaLimpeza(s.id); logger?.warn({uploadId:s.id},"Limpeza de upload pendente; verificar apos 20 tentativas"); }
        }
        await repository.removerAntigos();
      });
    } finally { limpando = false; }
  }
  return {iniciar,consultar,parte,finalizar,cancelar,autorizarParte,limparAbandonados,
    iniciarLimpeza() { if (!timer) { timer = setInterval(() => { void limparAbandonados().catch(() => logger?.warn("Limpeza de uploads temporariamente indisponivel")); },60000); timer.unref?.(); } },
    pararLimpeza() { clearInterval(timer); timer = null; }};
}
module.exports = {criarUploadRetomavelService,CHUNK_BYTES};
