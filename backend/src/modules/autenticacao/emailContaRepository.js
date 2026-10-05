const AppError = require("../../shared/errors/AppError");

function criarEmailContaRepository(pool, usuarioRepository, auditoriaRepository) {
  async function transacionar(operacao) {
    const conexao = await pool.getConnection();
    try {
      await conexao.beginTransaction();
      const resultado = await operacao(conexao);
      await conexao.commit();
      return resultado;
    } catch (erro) {
      await conexao.rollback().catch(() => {});
      throw erro;
    } finally { conexao.release(); }
  }

  async function criar(usuario, email, tokenHash, expiraEm) {
    return transacionar(async conexao => {
      const atual = await usuarioRepository.buscarPorId(usuario.id, conexao, true);
      if (!atual?.ativo || atual.email !== usuario.email || atual.senhaHash !== usuario.senhaHash
          || atual.versaoSessao !== usuario.versaoSessao) {
        throw new AppError("Sua conta mudou. Entre novamente e tente outra vez.", 409, "CONTA_ALTERADA");
      }
      await conexao.execute("UPDATE confirmacoes_email SET cancelada_em=CURRENT_TIMESTAMP(3) WHERE usuario_id=? AND usada_em IS NULL AND cancelada_em IS NULL", [usuario.id]);
      const [resultado] = await conexao.execute(
        "INSERT INTO confirmacoes_email(usuario_id,email_anterior,email_destino,usuario_versao,token_hash,expira_em) VALUES (?,?,?,?,?,?)",
        [usuario.id, usuario.email, email, usuario.versaoSessao, tokenHash, expiraEm]
      );
      return resultado.insertId;
    });
  }

  async function cancelar(id) {
    await pool.execute("UPDATE confirmacoes_email SET cancelada_em=CURRENT_TIMESTAMP(3) WHERE id=? AND usada_em IS NULL", [id]);
  }

  async function precisaRevisao(usuarioId, email) {
    const [registros] = await pool.execute(
      "SELECT usuario_id FROM lembretes_email WHERE usuario_id=? AND email_identificado=? AND resolvido_em IS NULL LIMIT 1",
      [usuarioId, email]
    );
    return registros.length > 0;
  }

  async function confirmar(usuarioId, tokenHash) {
    return transacionar(async conexao => {
      // Mesma ordem de locks da solicitacao: usuario, depois token.
      const usuario = await usuarioRepository.buscarPorId(usuarioId, conexao, true);
      const [pedidos] = await conexao.execute(
        "SELECT * FROM confirmacoes_email WHERE usuario_id=? AND token_hash=? AND usada_em IS NULL AND cancelada_em IS NULL AND expira_em>CURRENT_TIMESTAMP(3) FOR UPDATE",
        [usuarioId, tokenHash]
      );
      const pedido = pedidos[0];
      if (!usuario?.ativo || !pedido || pedido.email_anterior !== usuario.email
          || Number(pedido.usuario_versao) !== usuario.versaoSessao) {
        throw new AppError("Este link expirou ou já foi usado. Solicite uma nova confirmação na sua conta.", 400, "CONFIRMACAO_EMAIL_INVALIDA");
      }
      const alterado = pedido.email_destino !== usuario.email;
      if (alterado) {
        await usuarioRepository.atualizarEmail(usuarioId, pedido.email_destino, conexao);
        // Links enviados ao endereco antigo deixam de permitir recuperar a conta.
        await conexao.execute("UPDATE recuperacoes_senha SET usada_em=COALESCE(usada_em,CURRENT_TIMESTAMP(3)) WHERE usuario_id=? AND usada_em IS NULL", [usuarioId]);
      }
      await conexao.execute("UPDATE confirmacoes_email SET usada_em=CURRENT_TIMESTAMP(3) WHERE id=?", [pedido.id]);
      await conexao.execute("UPDATE lembretes_email SET resolvido_em=CURRENT_TIMESTAMP(3) WHERE usuario_id=? AND resolvido_em IS NULL", [usuarioId]);
      await auditoriaRepository.registrar({ atorUsuarioId: usuarioId, acao: alterado ? "email_atualizado" : "email_confirmado", entidade: "usuario", entidadeId: usuarioId, contexto: { emailAlterado: alterado } }, conexao);
      return usuarioRepository.buscarPorId(usuarioId, conexao);
    });
  }

  return { criar, cancelar, confirmar, precisaRevisao };
}

module.exports = criarEmailContaRepository;
