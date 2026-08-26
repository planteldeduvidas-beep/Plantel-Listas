const AppError = require("../../shared/errors/AppError");
const { validarConcessao, validarId } = require("./permissaoValidator");

function criarPermissaoService(dependencias) {
  const repository = dependencias.repository;
  const usuarioRepository = dependencias.usuarioRepository;
  const estruturaRepository = dependencias.estruturaRepository;

  function listarTodas() {
    return repository.listarTodas();
  }

  async function listarMinhas(usuario) {
    if (!usuario || usuario.papel !== "professor") {
      throw new AppError("Usuario sem permissao", 403, "SEM_PERMISSAO");
    }

    return repository.listarAtivasDoProfessor(usuario.id);
  }

  async function conceder(corpo, administrador) {
    const dados = validarConcessao(corpo);

    if (dados.professorId === administrador.id) {
      throw new AppError("Administrador nao pode conceder permissao a si mesmo", 409, "AUTO_CONCESSAO_NEGADA");
    }

    const professor = await usuarioRepository.buscarPorId(dados.professorId);

    if (!professor) {
      throw new AppError("Professor nao encontrado", 404, "PROFESSOR_NAO_ENCONTRADO");
    }

    if (!professor.ativo || professor.papel !== "professor") {
      throw new AppError("Usuario nao e professor ativo", 409, "PROFESSOR_INVALIDO");
    }

    const categoria = await estruturaRepository.buscarCategoriaPorId(dados.categoriaId);

    if (!categoria) {
      throw new AppError("Categoria nao encontrada", 404, "CATEGORIA_NAO_ENCONTRADA");
    }

    if (!categoria.ativo) {
      throw new AppError("Categoria esta inativa", 409, "CATEGORIA_INATIVA");
    }

    const existente = await repository.buscarPorProfessorCategoria(
      dados.professorId,
      dados.categoriaId
    );

    if (existente && existente.ativa) {
      throw new AppError("Permissao ja concedida", 409, "PERMISSAO_JA_CONCEDIDA");
    }

    return repository.conceder(
      dados.professorId,
      dados.categoriaId,
      administrador.id
    );
  }

  async function revogar(permissaoIdInformado, administrador) {
    const permissaoId = validarId(permissaoIdInformado, "Permissao");
    const permissao = await repository.buscarPorId(permissaoId);

    if (!permissao) {
      throw new AppError("Permissao nao encontrada", 404, "PERMISSAO_NAO_ENCONTRADA");
    }

    if (!permissao.ativa) {
      throw new AppError("Permissao ja revogada", 409, "PERMISSAO_JA_REVOGADA");
    }

    return repository.revogar(permissao.id, administrador.id);
  }

  return {
    listarTodas: listarTodas,
    listarMinhas: listarMinhas,
    conceder: conceder,
    revogar: revogar
  };
}

module.exports = criarPermissaoService;
