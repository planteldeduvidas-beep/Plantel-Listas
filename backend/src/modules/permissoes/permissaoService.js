const AppError = require("../../shared/errors/AppError");
const { validarConcessao, validarId, validarLote } = require("./permissaoValidator");

function criarPermissaoService(dependencias) {
  const repository = dependencias.repository;
  const usuarioRepository = dependencias.usuarioRepository;
  const estruturaRepository = dependencias.estruturaRepository;
  const auditoriaRepository = dependencias.auditoriaRepository;

  function auditar(administrador, acao, permissao, executor) {
    return auditoriaRepository.registrar({ atorUsuarioId: administrador.id, acao: acao, entidade: "permissao_professor", entidadeId: permissao.id, contexto: { professorId: permissao.professor.id, pastaId: permissao.categoria.id } },executor);
  }

  function listarTodas() {
    return repository.listarTodas();
  }

  function listarDisciplinas() { return repository.listarTodasDisciplinas(); }

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

    return repository.comTravaAdministrativa(async function concederComSeguranca(conexao){
      const professor=await usuarioRepository.buscarPorId(dados.professorId,conexao,true);
      if(!professor)throw new AppError("Professor nao encontrado",404,"PROFESSOR_NAO_ENCONTRADO");
      if(!professor.ativo||professor.papel!=="professor")throw new AppError("Usuario nao e professor ativo",409,"PROFESSOR_INVALIDO");
      const categoria=await estruturaRepository.buscarCategoriaPorId(dados.categoriaId,conexao,true);
      if(!categoria)throw new AppError("Categoria nao encontrada",404,"CATEGORIA_NAO_ENCONTRADA");
      if(!categoria.ativo)throw new AppError("Categoria esta inativa",409,"CATEGORIA_INATIVA");
      const existente=await repository.buscarPorProfessorCategoria(dados.professorId,dados.categoriaId,conexao);
      if(existente&&existente.ativa)throw new AppError("Permissao ja concedida",409,"PERMISSAO_JA_CONCEDIDA");
      const permissao=await repository.conceder(dados.professorId,dados.categoriaId,administrador.id,conexao);
      await auditar(administrador,"acesso_professor_concedido",permissao,conexao);
      return permissao;
    });
  }

  async function revogar(permissaoIdInformado, administrador) {
    const permissaoId = validarId(permissaoIdInformado, "Permissao");
    return repository.comTravaAdministrativa(async function revogarComAuditoria(conexao) {
      const permissao = await repository.buscarPorId(permissaoId, conexao);
      if (!permissao) throw new AppError("Permissao nao encontrada", 404, "PERMISSAO_NAO_ENCONTRADA");
      if (!permissao.ativa) throw new AppError("Permissao ja revogada", 409, "PERMISSAO_JA_REVOGADA");
      const revogada = await repository.revogar(permissao.id, administrador.id, conexao);
      await auditar(administrador, "acesso_professor_revogado", revogada, conexao);
      return revogada;
    });
  }

  async function salvarLote(professorIdInformado, corpo, administrador) {
    const professorId = validarId(professorIdInformado, "Professor");
    const { categoriaIds, disciplinaIds } = validarLote(corpo);
    return repository.comTravaAdministrativa(async function salvarComSeguranca(conexao){
      const professor=await usuarioRepository.buscarPorId(professorId,conexao,true);
      if(!professor||!professor.ativo||professor.papel!=="professor")throw new AppError("Professor ativo nao encontrado",404,"PROFESSOR_NAO_ENCONTRADO");
      for(const categoriaId of categoriaIds){const categoria=await estruturaRepository.buscarCategoriaPorId(categoriaId,conexao,true);if(!categoria||!categoria.ativo)throw new AppError("Pasta ativa nao encontrada",404,"CATEGORIA_NAO_ENCONTRADA");}
      if (disciplinaIds !== null) {
        for (const disciplinaId of disciplinaIds) {
          const [disciplinas] = await conexao.execute("SELECT id FROM disciplinas WHERE id=? AND ativo=1 LIMIT 1 FOR UPDATE", [disciplinaId]);
          if (!disciplinas.length) throw new AppError("Disciplina ativa nao encontrada",404,"DISCIPLINA_NAO_ENCONTRADA");
        }
      }
      await conexao.execute("UPDATE permissoes_professor_categoria SET revogada_em=CURRENT_TIMESTAMP(3),revogada_por_usuario_id=? WHERE professor_id=? AND revogada_em IS NULL",[administrador.id,professorId]);
      for(const categoriaId of categoriaIds){await conexao.execute("INSERT INTO permissoes_professor_categoria (professor_id,categoria_id,concedida_por_usuario_id) VALUES (?,?,?) ON DUPLICATE KEY UPDATE concedida_por_usuario_id=?,concedida_em=CURRENT_TIMESTAMP(3),revogada_por_usuario_id=NULL,revogada_em=NULL",[professorId,categoriaId,administrador.id,administrador.id]);}
      if (disciplinaIds !== null) {
        await conexao.execute("DELETE FROM professor_disciplinas WHERE professor_id=?", [professorId]);
        for (const disciplinaId of disciplinaIds) await conexao.execute("INSERT INTO professor_disciplinas (professor_id,disciplina_id,concedida_por_usuario_id) VALUES (?,?,?)", [professorId,disciplinaId,administrador.id]);
      }
      await auditoriaRepository.registrar({atorUsuarioId:administrador.id,acao:"acessos_professor_atualizados",entidade:"professor",entidadeId:professorId,contexto:{quantidadePastas:categoriaIds.length,quantidadeDisciplinas:disciplinaIds===null?null:disciplinaIds.length}},conexao);
      return repository.listarAtivasDoProfessor(professorId,conexao);
    });
  }

  return {
    listarTodas: listarTodas,
    listarDisciplinas: listarDisciplinas,
    listarMinhas: listarMinhas,
    conceder: conceder,
    revogar: revogar,
    salvarLote: salvarLote
  };
}

module.exports = criarPermissaoService;
