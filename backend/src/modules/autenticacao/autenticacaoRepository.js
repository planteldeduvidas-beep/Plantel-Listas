function criarAutenticacaoRepository(pool) {
  async function criarSessao(usuarioId, tokenHash, expiraEm) {
    const [resultado] = await pool.execute(
      "INSERT INTO sessoes (usuario_id, token_hash, expira_em) VALUES (?, ?, ?)",
      [usuarioId, tokenHash, expiraEm]
    );
    return resultado.insertId;
  }

  async function buscarSessaoAtivaPorHash(tokenHash) {
    const [registros] = await pool.execute(
      "SELECT s.id AS sessao_id, s.token_hash, s.expira_em, "
      + "u.id, u.nome, u.email, u.papel, u.ativo, u.criado_em, u.atualizado_em "
      + "FROM sessoes s INNER JOIN usuarios u ON u.id = s.usuario_id "
      + "WHERE s.token_hash = ? AND s.revogada_em IS NULL "
      + "AND s.expira_em > CURRENT_TIMESTAMP(3) AND u.ativo = 1 LIMIT 1",
      [tokenHash]
    );

    if (!registros[0]) {
      return null;
    }

    return {
      sessaoId: registros[0].sessao_id,
      tokenHash: registros[0].token_hash,
      expiraEm: registros[0].expira_em,
      usuario: {
        id: registros[0].id,
        nome: registros[0].nome,
        email: registros[0].email,
        papel: registros[0].papel,
        ativo: registros[0].ativo === 1,
        criadoEm: registros[0].criado_em,
        atualizadoEm: registros[0].atualizado_em
      }
    };
  }

  async function revogarSessaoPorHash(tokenHash) {
    await pool.execute(
      "UPDATE sessoes SET revogada_em = COALESCE(revogada_em, CURRENT_TIMESTAMP(3)) "
      + "WHERE token_hash = ?",
      [tokenHash]
    );
  }

  async function revogarSessoesDoUsuario(usuarioId, conexaoInformada) {
    const conexao = conexaoInformada || pool;
    await conexao.execute(
      "UPDATE sessoes SET revogada_em = COALESCE(revogada_em, CURRENT_TIMESTAMP(3)) "
      + "WHERE usuario_id = ? AND revogada_em IS NULL",
      [usuarioId]
    );
  }

  async function criarRecuperacaoSenha(usuarioId, tokenHash, expiraEm) {
    await pool.execute(
      "UPDATE recuperacoes_senha "
      + "SET usada_em = COALESCE(usada_em, CURRENT_TIMESTAMP(3)) "
      + "WHERE usuario_id = ? AND usada_em IS NULL",
      [usuarioId]
    );
    const [resultado] = await pool.execute(
      "INSERT INTO recuperacoes_senha (usuario_id, token_hash, expira_em) "
      + "VALUES (?, ?, ?)",
      [usuarioId, tokenHash, expiraEm]
    );
    return resultado.insertId;
  }

  async function invalidarRecuperacao(recuperacaoId) {
    await pool.execute(
      "UPDATE recuperacoes_senha SET usada_em = COALESCE(usada_em, CURRENT_TIMESTAMP(3)) "
      + "WHERE id = ?",
      [recuperacaoId]
    );
  }

  async function redefinirSenha(tokenHash, novaSenhaHash) {
    const conexao = await pool.getConnection();

    try {
      await conexao.beginTransaction();
      const [registros] = await conexao.execute(
        "SELECT id, usuario_id FROM recuperacoes_senha "
        + "WHERE token_hash = ? AND usada_em IS NULL "
        + "AND expira_em > CURRENT_TIMESTAMP(3) FOR UPDATE",
        [tokenHash]
      );

      if (!registros[0]) {
        await conexao.rollback();
        return false;
      }

      const recuperacao = registros[0];
      const [usuarioAtualizado] = await conexao.execute(
        "UPDATE usuarios SET senha_hash = ? WHERE id = ? AND ativo = 1",
        [novaSenhaHash, recuperacao.usuario_id]
      );

      if (usuarioAtualizado.affectedRows !== 1) {
        await conexao.rollback();
        return false;
      }

      await conexao.execute(
        "UPDATE recuperacoes_senha SET usada_em = CURRENT_TIMESTAMP(3) "
        + "WHERE usuario_id = ? AND usada_em IS NULL",
        [recuperacao.usuario_id]
      );
      await revogarSessoesDoUsuario(recuperacao.usuario_id, conexao);
      await conexao.commit();
      return true;
    } catch (erro) {
      await conexao.rollback();
      throw erro;
    } finally {
      conexao.release();
    }
  }

  return {
    criarSessao: criarSessao,
    buscarSessaoAtivaPorHash: buscarSessaoAtivaPorHash,
    revogarSessaoPorHash: revogarSessaoPorHash,
    revogarSessoesDoUsuario: revogarSessoesDoUsuario,
    criarRecuperacaoSenha: criarRecuperacaoSenha,
    invalidarRecuperacao: invalidarRecuperacao,
    redefinirSenha: redefinirSenha
  };
}

module.exports = criarAutenticacaoRepository;

