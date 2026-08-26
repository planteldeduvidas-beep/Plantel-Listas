const AppError = require("../../shared/errors/AppError");
const criarUsuarioPublico = require("./usuarioPublico");
const {
  validarUsuarioId,
  validarAlteracaoDeAtivo,
  validarAlteracaoDePapel
} = require("./usuarioValidator");

function criarUsuarioService(dependencias) {
  const usuarioRepository = dependencias.usuarioRepository;
  const autenticacaoRepository = dependencias.autenticacaoRepository;
  const logger = dependencias.logger;

  async function listarUsuarios() {
    const usuarios = await usuarioRepository.listar();
    return usuarios.map(criarUsuarioPublico);
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

    const alterado = await usuarioRepository.atualizarAtivo(usuarioId, dados.ativo);
    if (!alterado) {
      throw new AppError("Usuario nao encontrado", 404, "USUARIO_NAO_ENCONTRADO");
    }

    if (!dados.ativo) {
      await autenticacaoRepository.revogarSessoesDoUsuario(usuarioId);
    }

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

    const alterado = await usuarioRepository.atualizarPapel(usuarioId, dados.papel);
    if (!alterado) {
      throw new AppError("Usuario nao encontrado", 404, "USUARIO_NAO_ENCONTRADO");
    }

    await autenticacaoRepository.revogarSessoesDoUsuario(usuarioId);
    logger.info(
      { atorUsuarioId: usuarioAutenticado.id, alvoUsuarioId: usuarioId, papel: dados.papel },
      "Papel de usuario alterado"
    );
    return criarUsuarioPublico(await usuarioRepository.buscarPorId(usuarioId));
  }

  return {
    listarUsuarios: listarUsuarios,
    alterarAtivo: alterarAtivo,
    alterarPapel: alterarPapel
  };
}

module.exports = criarUsuarioService;
