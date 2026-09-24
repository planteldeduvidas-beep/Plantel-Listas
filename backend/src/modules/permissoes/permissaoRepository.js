const AppError = require("../../shared/errors/AppError");

function mapearPermissao(registro) {
  if (!registro) {
    return null;
  }

  return {
    id: registro.id,
    professor: {
      id: registro.professor_id,
      email: registro.professor_email
    },
    categoria: {
      id: registro.categoria_id,
      nome: registro.categoria_nome,
      ativo: registro.categoria_ativo === 1
    },
    concedidaPorUsuarioId: registro.concedida_por_usuario_id,
    revogadaPorUsuarioId: registro.revogada_por_usuario_id,
    concedidaEm: registro.concedida_em,
    revogadaEm: registro.revogada_em,
    ativa: registro.revogada_em === null
  };
}

const SELECAO = "SELECT permissao.id, permissao.professor_id, professor.email AS professor_email, "
  + "permissao.categoria_id, categoria.nome AS categoria_nome, categoria.ativo AS categoria_ativo, "
  + "permissao.concedida_por_usuario_id, permissao.revogada_por_usuario_id, "
  + "permissao.concedida_em, permissao.revogada_em "
  + "FROM permissoes_professor_categoria permissao "
  + "INNER JOIN usuarios professor ON professor.id = permissao.professor_id "
  + "INNER JOIN categorias categoria ON categoria.id = permissao.categoria_id ";

function criarPermissaoRepository(pool) {
  async function buscarPorId(permissaoId, executorInformado) {
    const executor = executorInformado || pool;
    const [registros] = await executor.execute(
      SELECAO + "WHERE permissao.id = ? LIMIT 1",
      [permissaoId]
    );
    return mapearPermissao(registros[0]);
  }

  async function buscarPorProfessorCategoria(professorId, categoriaId, executorInformado) {
    const executor = executorInformado || pool;
    const [registros] = await executor.execute(
      SELECAO + "WHERE permissao.professor_id = ? AND permissao.categoria_id = ? LIMIT 1",
      [professorId, categoriaId]
    );
    return mapearPermissao(registros[0]);
  }

  async function listarTodas() {
    const [registros] = await pool.execute(
      SELECAO + "ORDER BY permissao.revogada_em IS NULL DESC, professor.email ASC, categoria.nome ASC"
    );
    return registros.map(mapearPermissao);
  }

  async function listarAtivasDoProfessor(professorId, executorInformado) {
    const executor = executorInformado || pool;
    const [registros] = await executor.execute(
      SELECAO
      + "WHERE permissao.professor_id = ? AND permissao.revogada_em IS NULL "
      + "AND categoria.ativo = 1 ORDER BY categoria.nome ASC",
      [professorId]
    );
    return registros.map(mapearPermissao);
  }

  async function conceder(professorId, categoriaId, administradorId, executorInformado) {
    const executor = executorInformado || pool;
    const [resultado] = await executor.execute(
      "INSERT INTO permissoes_professor_categoria "
      + "(professor_id, categoria_id, concedida_por_usuario_id) VALUES (?, ?, ?) "
      + "ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), "
      + "concedida_por_usuario_id = ?, revogada_por_usuario_id = NULL, "
      + "concedida_em = CURRENT_TIMESTAMP(3), revogada_em = NULL",
      [professorId, categoriaId, administradorId, administradorId]
    );
    return buscarPorId(resultado.insertId,executor);
  }

  async function revogar(permissaoId, administradorId, executorInformado) {
    const executor = executorInformado || pool;
    const [resultado] = await executor.execute(
      "UPDATE permissoes_professor_categoria "
      + "SET revogada_em = CURRENT_TIMESTAMP(3), revogada_por_usuario_id = ? "
      + "WHERE id = ? AND revogada_em IS NULL",
      [administradorId, permissaoId]
    );
    if (resultado.affectedRows !== 1) throw new AppError("Permissao ja revogada",409,"PERMISSAO_JA_REVOGADA");
    return buscarPorId(permissaoId, executor);
  }

  async function salvarLote(professorId, categoriaIds, administradorId) {
    const conexao = await pool.getConnection();
    try {
      await conexao.beginTransaction();
      await conexao.execute(
        "UPDATE permissoes_professor_categoria SET revogada_em=CURRENT_TIMESTAMP(3),revogada_por_usuario_id=? "
        + "WHERE professor_id=? AND revogada_em IS NULL",
        [administradorId, professorId]
      );
      for (const categoriaId of categoriaIds) {
        await conexao.execute(
          "INSERT INTO permissoes_professor_categoria (professor_id,categoria_id,concedida_por_usuario_id) VALUES (?,?,?) "
          + "ON DUPLICATE KEY UPDATE concedida_por_usuario_id=?,concedida_em=CURRENT_TIMESTAMP(3),revogada_por_usuario_id=NULL,revogada_em=NULL",
          [professorId, categoriaId, administradorId, administradorId]
        );
      }
      await conexao.commit();
    } catch (erro) {
      await conexao.rollback();
      throw erro;
    } finally { conexao.release(); }
    return listarAtivasDoProfessor(professorId);
  }

  async function listarDisciplinasDoProfessor(professorId, executorInformado) {
    const executor = executorInformado || pool;
    const [registros] = await executor.execute(
      "SELECT pd.disciplina_id AS id,d.nome FROM professor_disciplinas pd INNER JOIN disciplinas d ON d.id=pd.disciplina_id "
      + "WHERE pd.professor_id=? AND d.ativo=1 ORDER BY d.nome", [professorId]
    );
    return registros.map(function mapear(item) { return { id:Number(item.id), nome:item.nome }; });
  }

  async function listarTodasDisciplinas() {
    const [registros] = await pool.execute("SELECT professor_id,disciplina_id FROM professor_disciplinas ORDER BY professor_id,disciplina_id");
    return registros.map(function mapear(item) { return { professorId:Number(item.professor_id), disciplinaId:Number(item.disciplina_id) }; });
  }

  async function comTravaAdministrativa(funcao) {
    const conexao=await pool.getConnection();let travaObtida=false;
    try{
      const [travas]=await conexao.execute("SELECT GET_LOCK(LEFT(CONCAT('plantel_admin_usuarios_',DATABASE()),64),5) AS obtida");
      if(Number(travas[0].obtida)!==1)throw new AppError("Outra alteracao administrativa esta em andamento",409,"ALTERACAO_CONCORRENTE");
      travaObtida=true;await conexao.beginTransaction();
      try{const resultado=await funcao(conexao);await conexao.commit();return resultado;}
      catch(erro){await conexao.rollback().catch(function preservar(){});throw erro;}
    }finally{
      if(travaObtida)await conexao.execute("SELECT RELEASE_LOCK(LEFT(CONCAT('plantel_admin_usuarios_',DATABASE()),64))").catch(function ignorar(){});
      conexao.release();
    }
  }

  return {
    buscarPorId: buscarPorId,
    buscarPorProfessorCategoria: buscarPorProfessorCategoria,
    listarTodas: listarTodas,
    listarAtivasDoProfessor: listarAtivasDoProfessor,
    listarDisciplinasDoProfessor: listarDisciplinasDoProfessor,
    listarTodasDisciplinas: listarTodasDisciplinas,
    conceder: conceder,
    revogar: revogar,
    salvarLote: salvarLote,
    comTravaAdministrativa: comTravaAdministrativa
  };
}

module.exports = criarPermissaoRepository;
