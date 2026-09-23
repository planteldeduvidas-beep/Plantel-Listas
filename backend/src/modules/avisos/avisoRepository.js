function criarAvisoRepository(pool) {
  async function listar(apenasAtivos) {
    const [linhas] = await pool.execute(
      "SELECT id,texto,ativo,ordem FROM avisos_biblioteca " + (apenasAtivos ? "WHERE ativo=1 " : "") + "ORDER BY ordem,id"
    );
    return linhas;
  }

  async function buscar(id, conexao) {
    const [linhas] = await conexao.execute("SELECT id,texto,ativo,ordem FROM avisos_biblioteca WHERE id=? FOR UPDATE", [id]);
    return linhas[0] || null;
  }

  async function criar(dados, conexao) {
    const [resultado] = await conexao.execute(
      "INSERT INTO avisos_biblioteca (texto,ativo,ordem) VALUES (?,?,?)",
      [dados.texto, dados.ativo ? 1 : 0, dados.ordem]
    );
    return Number(resultado.insertId);
  }

  async function atualizar(id, dados, conexao) {
    await conexao.execute("UPDATE avisos_biblioteca SET texto=?,ativo=?,ordem=? WHERE id=?",
      [dados.texto, dados.ativo ? 1 : 0, dados.ordem, id]);
  }

  async function comTransacao(operacao) {
    const conexao = await pool.getConnection();
    let aberta = false;
    try {
      await conexao.beginTransaction();
      aberta = true;
      const resultado = await operacao(conexao);
      await conexao.commit();
      aberta = false;
      return resultado;
    } catch (erro) {
      if (aberta) await conexao.rollback().catch(() => {});
      throw erro;
    } finally {
      conexao.release();
    }
  }

  return { listar, buscar, criar, atualizar, comTransacao };
}

module.exports = criarAvisoRepository;
