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
  async function buscarPorId(permissaoId) {
    const [registros] = await pool.execute(
      SELECAO + "WHERE permissao.id = ? LIMIT 1",
      [permissaoId]
    );
    return mapearPermissao(registros[0]);
  }

  async function buscarPorProfessorCategoria(professorId, categoriaId) {
    const [registros] = await pool.execute(
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

  async function listarAtivasDoProfessor(professorId) {
    const [registros] = await pool.execute(
      SELECAO
      + "WHERE permissao.professor_id = ? AND permissao.revogada_em IS NULL "
      + "AND categoria.ativo = 1 ORDER BY categoria.nome ASC",
      [professorId]
    );
    return registros.map(mapearPermissao);
  }

  async function conceder(professorId, categoriaId, administradorId) {
    const [resultado] = await pool.execute(
      "INSERT INTO permissoes_professor_categoria "
      + "(professor_id, categoria_id, concedida_por_usuario_id) VALUES (?, ?, ?) "
      + "ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), "
      + "concedida_por_usuario_id = ?, revogada_por_usuario_id = NULL, "
      + "concedida_em = CURRENT_TIMESTAMP(3), revogada_em = NULL",
      [professorId, categoriaId, administradorId, administradorId]
    );
    return buscarPorId(resultado.insertId);
  }

  async function revogar(permissaoId, administradorId) {
    await pool.execute(
      "UPDATE permissoes_professor_categoria "
      + "SET revogada_em = CURRENT_TIMESTAMP(3), revogada_por_usuario_id = ? "
      + "WHERE id = ? AND revogada_em IS NULL",
      [administradorId, permissaoId]
    );
    return buscarPorId(permissaoId);
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

  return {
    buscarPorId: buscarPorId,
    buscarPorProfessorCategoria: buscarPorProfessorCategoria,
    listarTodas: listarTodas,
    listarAtivasDoProfessor: listarAtivasDoProfessor,
    conceder: conceder,
    revogar: revogar,
    salvarLote: salvarLote
  };
}

module.exports = criarPermissaoRepository;
