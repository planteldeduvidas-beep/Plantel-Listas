const CAMPOS = "id,nome,descricao,url_externa AS link,cupom,desconto,texto_botao AS textoBotao,ativo,ordem,imagem_mime IS NOT NULL AS temImagem,imagem_atualizada_em AS imagemAtualizadaEm";

function criarParceiroRepository(pool) {
  async function listar(apenasAtivos) {
    const [linhas] = await pool.execute(
      "SELECT " + CAMPOS + " FROM parceiros_plantel " + (apenasAtivos ? "WHERE ativo=1 " : "") + "ORDER BY ordem,id"
    );
    return linhas;
  }

  async function buscar(id, executor = pool, bloquear = false) {
    const [linhas] = await executor.execute(
      "SELECT " + CAMPOS + " FROM parceiros_plantel WHERE id=?" + (bloquear ? " FOR UPDATE" : ""), [id]
    );
    return linhas[0] || null;
  }

  async function criar(dados, executor) {
    const [resultado] = await executor.execute(
      "INSERT INTO parceiros_plantel (nome,descricao,url_externa,cupom,desconto,texto_botao,ativo,ordem) VALUES (?,?,?,?,?,?,?,?)",
      [dados.nome, dados.descricao, dados.link, dados.cupom, dados.desconto, dados.textoBotao, dados.ativo ? 1 : 0, dados.ordem]
    );
    return Number(resultado.insertId);
  }

  async function atualizar(id, dados, executor) {
    await executor.execute(
      "UPDATE parceiros_plantel SET nome=?,descricao=?,url_externa=?,cupom=?,desconto=?,texto_botao=?,ativo=?,ordem=? WHERE id=?",
      [dados.nome, dados.descricao, dados.link, dados.cupom, dados.desconto, dados.textoBotao, dados.ativo ? 1 : 0, dados.ordem, id]
    );
  }

  async function atualizarImagem(id, mime, bytes, executor) {
    await executor.execute(
      "UPDATE parceiros_plantel SET imagem_mime=?,imagem_dados=?,imagem_atualizada_em=CURRENT_TIMESTAMP(3) WHERE id=?",
      [mime, bytes, id]
    );
  }

  async function buscarImagem(id) {
    const [linhas] = await pool.execute(
      "SELECT imagem_mime AS mime,imagem_dados AS dados,imagem_atualizada_em AS atualizadaEm,ativo FROM parceiros_plantel WHERE id=?", [id]
    );
    return linhas[0] || null;
  }

  async function comTransacao(operacao) {
    const conexao = await pool.getConnection();
    try {
      await conexao.beginTransaction();
      const resultado = await operacao(conexao);
      await conexao.commit();
      return resultado;
    } catch (erro) {
      await conexao.rollback();
      throw erro;
    } finally {
      conexao.release();
    }
  }

  return { listar, buscar, criar, atualizar, atualizarImagem, buscarImagem, comTransacao };
}

module.exports = criarParceiroRepository;
