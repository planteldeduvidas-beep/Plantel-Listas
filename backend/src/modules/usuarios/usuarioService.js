const AppError = require("../../shared/errors/AppError");
const criarUsuarioPublico = require("./usuarioPublico");
const {
  validarUsuarioId,
  validarAlteracaoDeAtivo,
  validarAlteracaoDePapel,
  validarConsulta,
  validarCriacao,
  validarEdicao
} = require("./usuarioValidator");
const { criarHashDaSenha } = require("../autenticacao/senha");

function criarUsuarioService(dependencias) {
  const usuarioRepository = dependencias.usuarioRepository;
  const autenticacaoRepository = dependencias.autenticacaoRepository;
  const logger = dependencias.logger;
  const auditoriaRepository = dependencias.auditoriaRepository;
  const autenticacaoService = dependencias.autenticacaoService;
  const emailContaService = dependencias.emailContaService;

  async function exigirUsuario(id, conexao, trava = false) {
    const atual = await usuarioRepository.buscarPorId(id, conexao, trava);
    if (!atual || atual.excluidoEm || atual.cadastroEmailPendente) throw new AppError("Usuário não encontrado",404,"USUARIO_NAO_ENCONTRADO");
    return atual;
  }

  async function obterDetalhes(parametroId) {
    const atual = await usuarioRepository.obterDetalhes(validarUsuarioId(parametroId));
    if (!atual) throw new AppError("Usuário não encontrado",404,"USUARIO_NAO_ENCONTRADO");
    return { ...criarUsuarioPublico(atual), criadoEm: atual.criadoEm, ultimoLogin: atual.ultimoLogin,
      emailConfirmadoEm: atual.emailConfirmadoEm,
      inatividadeSegundos: atual.ultimoLogin ? Math.max(0,Math.floor((Date.now()-new Date(atual.ultimoLogin).getTime())/1000)) : null };
  }

  async function excluirUsuario(ator,parametroId,corpo) {
    const id = validarUsuarioId(parametroId);
    if (!corpo || corpo.confirmar !== true || Object.keys(corpo).some(k=>k!=="confirmar")) throw new AppError("Confirme explicitamente a exclusão da conta",400,"CONFIRMACAO_OBRIGATORIA");
    if (id === ator.id) throw new AppError("Você não pode excluir sua própria conta",409,"AUTO_EXCLUSAO_NEGADA");
    await usuarioRepository.comTravaAdministrativa(async c => {
      const atual = await exigirUsuario(id,c,true);
      if (atual.papel === "admin" && atual.ativo && await usuarioRepository.contarAdminsAtivos(c)<=1) throw new AppError("O último administrador ativo não pode ser excluído",409,"ULTIMO_ADMIN_ATIVO");
      await usuarioRepository.excluirLogicamente(id,c);
      await autenticacaoRepository.revogarSessoesDoUsuario(id,c);
      if (atual.papel === "professor") await usuarioRepository.revogarPermissoesDoProfessor(id,ator.id,c);
      await registrar(ator,"usuario_excluido",id,{exclusaoLogica:true},c);
    });
    return { mensagem:"Conta excluída da gestão e acesso encerrado. Histórico e vínculos foram preservados." };
  }

  async function solicitarRegularizacao(ator,parametroId,corpo) {
    if (corpo && Object.keys(corpo).length) throw new AppError("Campos não permitidos",400,"CAMPOS_NAO_PERMITIDOS");
    const id = validarUsuarioId(parametroId);
    await usuarioRepository.comTravaAdministrativa(async c => {
      const atual = await exigirUsuario(id,c,true);
      await usuarioRepository.regularizarEmail(atual,c);
      await registrar(ator,"regularizacao_email_solicitada",id,{},c);
    });
    return {mensagem:"A conta verá um aviso para revisar o e-mail. O acesso não foi bloqueado."};
  }

  async function enviarVerificacao(ator,parametroId,corpo) {
    if (corpo && Object.keys(corpo).length) throw new AppError("Campos não permitidos",400,"CAMPOS_NAO_PERMITIDOS");
    const id = validarUsuarioId(parametroId);
    const atual = await exigirUsuario(id);
    if (!atual.ativo) throw new AppError("Libere a conta antes de enviar a verificação",409,"CONTA_BLOQUEADA");
    const detalhes = await obterDetalhes(id);
    if (detalhes.emailConfirmadoEm) throw new AppError("O endereço atual já foi confirmado",409,"EMAIL_JA_CONFIRMADO");
    const resultado = await emailContaService.enviarVerificacaoAdministrativa(atual);
    await registrar(ator,"verificacao_email_enviada",id,{});
    return resultado;
  }

  async function listarUsuarios(query) {
    const filtros = validarConsulta(query || {});
    const resultado = await usuarioRepository.listar(filtros);
    return { usuarios: resultado.itens.map(criarUsuarioPublico), paginacao: { pagina: filtros.pagina, limite: filtros.limite, total: resultado.total, totalPaginas: Math.max(1, Math.ceil(resultado.total / filtros.limite)) } };
  }

  async function registrar(ator, acao, alvo, contexto, executor) {
    await auditoriaRepository.registrar({ atorUsuarioId: ator.id, acao: acao, entidade: "usuario", entidadeId: alvo, contexto: contexto }, executor);
  }

  async function criarUsuario(usuarioAutenticado, corpo) {
    const dados = validarCriacao(corpo);
    const senhaHash = await criarHashDaSenha(dados.senha);
    const usuario = await usuarioRepository.comTravaAdministrativa(async function criarComAuditoria(conexao) {
      const criado = await usuarioRepository.criar(dados.nome, dados.email, senhaHash, dados.papel, conexao);
      await registrar(usuarioAutenticado, "usuario_criado", criado.id, { papel: criado.papel }, conexao);
      return criado;
    });
    return criarUsuarioPublico(usuario);
  }

  async function editarUsuario(usuarioAutenticado, parametroId, corpo) {
    const id = validarUsuarioId(parametroId);
    const dados = validarEdicao(corpo);
    const usuario = await usuarioRepository.comTravaAdministrativa(async function editarComAuditoria(conexao) {
      const atual = await exigirUsuario(id, conexao);
      if (!atual) throw new AppError("Usuario nao encontrado", 404, "USUARIO_NAO_ENCONTRADO");
      if (!await usuarioRepository.atualizarDados(id, dados.nome, dados.email, conexao)) throw new AppError("Usuario nao encontrado", 404, "USUARIO_NAO_ENCONTRADO");
      await registrar(usuarioAutenticado, "usuario_editado", id, { nomeAlterado: true, emailAlterado: true }, conexao);
      return usuarioRepository.buscarPorId(id, conexao);
    });
    return criarUsuarioPublico(usuario);
  }

  async function alterarAtivo(usuarioAutenticado, parametroId, corpo) {
    const usuarioId = validarUsuarioId(parametroId);
    const dados = validarAlteracaoDeAtivo(corpo);

    if (usuarioId === usuarioAutenticado.id && !dados.ativo) {
      throw new AppError(
        "O admin nao pode desativar a propria conta",
        409,
        "AUTO_DESATIVACAO_NEGADA"
      );
    }

    await usuarioRepository.comTravaAdministrativa(async function alterarComSeguranca(conexao) {
      const atual = await exigirUsuario(usuarioId,conexao,true);
      if (!atual) throw new AppError("Usuario nao encontrado", 404, "USUARIO_NAO_ENCONTRADO");
      if (atual.papel === "admin" && atual.ativo && !dados.ativo && await usuarioRepository.contarAdminsAtivos(conexao) <= 1) {
        throw new AppError("O ultimo administrador ativo nao pode ser bloqueado", 409, "ULTIMO_ADMIN_ATIVO");
      }
      await usuarioRepository.atualizarAtivo(usuarioId, dados.ativo, conexao);
      if (!dados.ativo) await autenticacaoRepository.revogarSessoesDoUsuario(usuarioId,conexao);
      await registrar(usuarioAutenticado,dados.ativo ? "usuario_ativado" : "usuario_desativado",usuarioId,{},conexao);
    });

    logger.info(
      { atorUsuarioId: usuarioAutenticado.id, alvoUsuarioId: usuarioId, ativo: dados.ativo },
      "Estado de usuario alterado"
    );
    return criarUsuarioPublico(await usuarioRepository.buscarPorId(usuarioId));
  }

  async function alterarPapel(usuarioAutenticado, parametroId, corpo) {
    const usuarioId = validarUsuarioId(parametroId);
    const dados = validarAlteracaoDePapel(corpo);

    if (usuarioId === usuarioAutenticado.id && dados.papel !== "admin") {
      throw new AppError(
        "O admin nao pode remover o proprio papel",
        409,
        "AUTO_REMOCAO_ADMIN_NEGADA"
      );
    }

    let atual;
    await usuarioRepository.comTravaAdministrativa(async function alterarComSeguranca(conexao) {
      atual = await exigirUsuario(usuarioId,conexao,true);
      if (!atual) throw new AppError("Usuario nao encontrado", 404, "USUARIO_NAO_ENCONTRADO");
      if (atual.papel === "admin" && atual.ativo && dados.papel !== "admin" && await usuarioRepository.contarAdminsAtivos(conexao) <= 1) {
        throw new AppError("O ultimo administrador ativo deve permanecer administrador", 409, "ULTIMO_ADMIN_ATIVO");
      }
      await usuarioRepository.atualizarPapel(usuarioId, dados.papel,conexao);
      await autenticacaoRepository.revogarSessoesDoUsuario(usuarioId,conexao);
      if (atual.papel === "professor" && dados.papel !== "professor") {
        await usuarioRepository.revogarPermissoesDoProfessor(usuarioId, usuarioAutenticado.id,conexao);
      }
      await registrar(usuarioAutenticado,"papel_alterado",usuarioId,{ papelAnterior: atual.papel, papelNovo: dados.papel },conexao);
    });
    logger.info(
      { atorUsuarioId: usuarioAutenticado.id, alvoUsuarioId: usuarioId, papel: dados.papel },
      "Papel de usuario alterado"
    );
    return criarUsuarioPublico(await usuarioRepository.buscarPorId(usuarioId));
  }

  async function iniciarRedefinicao(usuarioAutenticado, parametroId, corpo) {
    if (corpo && Object.keys(corpo).length) throw new AppError("Campos nao permitidos", 400, "CAMPOS_NAO_PERMITIDOS");
    const id = validarUsuarioId(parametroId);
    const usuario = await exigirUsuario(id);
    if (!usuario) throw new AppError("Usuario nao encontrado", 404, "USUARIO_NAO_ENCONTRADO");
    await autenticacaoService.solicitarRecuperacao({ email: usuario.email });
    await registrar(usuarioAutenticado, "redefinicao_administrativa_iniciada", id, {});
    return { mensagem: "Se a conta estiver ativa, as instrucoes serao enviadas por email." };
  }

  return {
    obterDetalhes, excluirUsuario, solicitarRegularizacao, enviarVerificacao,
    listarUsuarios: listarUsuarios,
    criarUsuario: criarUsuario,
    editarUsuario: editarUsuario,
    alterarAtivo: alterarAtivo,
    alterarPapel: alterarPapel,
    iniciarRedefinicao: iniciarRedefinicao
  };
}

module.exports = criarUsuarioService;
