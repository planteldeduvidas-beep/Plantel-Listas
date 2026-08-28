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

  async function listarUsuarios(query) {
    const filtros = validarConsulta(query || {});
    const resultado = await usuarioRepository.listar(filtros);
    return { usuarios: resultado.itens.map(criarUsuarioPublico), paginacao: { pagina: filtros.pagina, limite: filtros.limite, total: resultado.total, totalPaginas: Math.max(1, Math.ceil(resultado.total / filtros.limite)) } };
  }

  async function registrar(ator, acao, alvo, contexto) {
    await auditoriaRepository.registrar({ atorUsuarioId: ator.id, acao: acao, entidade: "usuario", entidadeId: alvo, contexto: contexto });
  }

  async function criarUsuario(usuarioAutenticado, corpo) {
    const dados = validarCriacao(corpo);
    const usuario = await usuarioRepository.criar(dados.email, await criarHashDaSenha(dados.senha), dados.papel);
    await registrar(usuarioAutenticado, "usuario_criado", usuario.id, { papel: usuario.papel });
    return criarUsuarioPublico(usuario);
  }

  async function editarUsuario(usuarioAutenticado, parametroId, corpo) {
    const id = validarUsuarioId(parametroId);
    const dados = validarEdicao(corpo);
    if (!await usuarioRepository.atualizarEmail(id, dados.email)) throw new AppError("Usuario nao encontrado", 404, "USUARIO_NAO_ENCONTRADO");
    await registrar(usuarioAutenticado, "usuario_editado", id, { emailAlterado: true });
    return criarUsuarioPublico(await usuarioRepository.buscarPorId(id));
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

    await usuarioRepository.comTravaAdministrativa(async function alterarComSeguranca() {
      const atual = await usuarioRepository.buscarPorId(usuarioId);
      if (!atual) throw new AppError("Usuario nao encontrado", 404, "USUARIO_NAO_ENCONTRADO");
      if (atual.papel === "admin" && atual.ativo && !dados.ativo && await usuarioRepository.contarAdminsAtivos() <= 1) {
        throw new AppError("O ultimo administrador ativo nao pode ser bloqueado", 409, "ULTIMO_ADMIN_ATIVO");
      }
      await usuarioRepository.atualizarAtivo(usuarioId, dados.ativo);
    });

    if (!dados.ativo) {
      await autenticacaoRepository.revogarSessoesDoUsuario(usuarioId);
    }

    logger.info(
      { atorUsuarioId: usuarioAutenticado.id, alvoUsuarioId: usuarioId, ativo: dados.ativo },
      "Estado de usuario alterado"
    );
    await registrar(usuarioAutenticado, dados.ativo ? "usuario_ativado" : "usuario_desativado", usuarioId, {});
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
    await usuarioRepository.comTravaAdministrativa(async function alterarComSeguranca() {
      atual = await usuarioRepository.buscarPorId(usuarioId);
      if (!atual) throw new AppError("Usuario nao encontrado", 404, "USUARIO_NAO_ENCONTRADO");
      if (atual.papel === "admin" && atual.ativo && dados.papel !== "admin" && await usuarioRepository.contarAdminsAtivos() <= 1) {
        throw new AppError("O ultimo administrador ativo deve permanecer administrador", 409, "ULTIMO_ADMIN_ATIVO");
      }
      await usuarioRepository.atualizarPapel(usuarioId, dados.papel);
      await autenticacaoRepository.revogarSessoesDoUsuario(usuarioId);
      if (atual.papel === "professor" && dados.papel !== "professor") {
        await usuarioRepository.revogarPermissoesDoProfessor(usuarioId, usuarioAutenticado.id);
      }
    });
    logger.info(
      { atorUsuarioId: usuarioAutenticado.id, alvoUsuarioId: usuarioId, papel: dados.papel },
      "Papel de usuario alterado"
    );
    await registrar(usuarioAutenticado, "papel_alterado", usuarioId, { papelAnterior: atual.papel, papelNovo: dados.papel });
    return criarUsuarioPublico(await usuarioRepository.buscarPorId(usuarioId));
  }

  async function iniciarRedefinicao(usuarioAutenticado, parametroId, corpo) {
    if (corpo && Object.keys(corpo).length) throw new AppError("Campos nao permitidos", 400, "CAMPOS_NAO_PERMITIDOS");
    const id = validarUsuarioId(parametroId);
    const usuario = await usuarioRepository.buscarPorId(id);
    if (!usuario) throw new AppError("Usuario nao encontrado", 404, "USUARIO_NAO_ENCONTRADO");
    await autenticacaoService.solicitarRecuperacao({ email: usuario.email });
    await registrar(usuarioAutenticado, "redefinicao_administrativa_iniciada", id, {});
    return { mensagem: "Se a conta estiver ativa, as instrucoes serao enviadas por email." };
  }

  return {
    listarUsuarios: listarUsuarios,
    criarUsuario: criarUsuario,
    editarUsuario: editarUsuario,
    alterarAtivo: alterarAtivo,
    alterarPapel: alterarPapel,
    iniciarRedefinicao: iniciarRedefinicao
  };
}

module.exports = criarUsuarioService;
