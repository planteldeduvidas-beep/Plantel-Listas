const AppError = require("../../shared/errors/AppError");

function identificarTipo(mimeType) {
  if (mimeType === "application/pdf") {
    return "pdf";
  }
  if (typeof mimeType === "string" && mimeType.startsWith("video/")) {
    return "video";
  }
  return "outro";
}

function obterExtensao(nome) {
  const resultado = typeof nome === "string" ? nome.match(/\.([a-zA-Z0-9]{1,30})$/) : null;
  return resultado ? resultado[1].toLowerCase() : null;
}

function dataOuNula(valor) {
  const data = valor ? new Date(valor) : null;
  return data && !Number.isNaN(data.getTime()) ? data : null;
}

function criarGoogleDriveChangesRepository(pool) {
  async function adquirirTrava() {
    const conexao = await pool.getConnection();
    const [registros] = await conexao.execute(
      "SELECT GET_LOCK('plantel_listas_google_drive_changes',0) AS adquirida"
    );
    if (Number(registros[0].adquirida) !== 1) {
      conexao.release();
      return null;
    }
    return conexao;
  }

  async function liberarTrava(conexao) {
    try {
      await conexao.execute("SELECT RELEASE_LOCK('plantel_listas_google_drive_changes')");
    } finally {
      conexao.release();
    }
  }

  async function buscarEstado(executorInformado) {
    const executor = executorInformado || pool;
    const [registros] = await executor.execute(
      "SELECT page_token,reconciliacao_necessaria,ultima_verificacao_em,ultimo_erro_codigo "
      + "FROM estado_changes_google_drive WHERE id=1 LIMIT 1"
    );
    return registros[0] || null;
  }

  async function salvarEstadoInicial(pageToken) {
    await pool.execute(
      "INSERT INTO estado_changes_google_drive (id,page_token,atualizado_em) "
      + "VALUES (1,?,CURRENT_TIMESTAMP(3)) AS novo "
      + "ON DUPLICATE KEY UPDATE page_token=novo.page_token,atualizado_em=novo.atualizado_em,ultimo_erro_codigo=NULL",
      [pageToken]
    );
  }

  async function registrarErro(codigo) {
    await pool.execute(
      "UPDATE estado_changes_google_drive SET ultimo_erro_codigo=?,ultima_verificacao_em=CURRENT_TIMESTAMP(3) WHERE id=1",
      [String(codigo || "GOOGLE_CHANGES_FALHOU").slice(0, 100)]
    );
  }

  async function aplicarAlteracoes(conexao, alteracoes, novoPageToken) {
    await conexao.beginTransaction();
    try {
      const [sincronizacao] = await conexao.execute(
        "INSERT INTO sincronizacoes_google_drive "
        + "(iniciado_por_usuario_id,origem,status,solicitada_em,iniciada_em) "
        + "VALUES (NULL,'changes','sincronizando',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3))"
      );
      const sincronizacaoId = Number(sincronizacao.insertId);
      let atualizados = 0;
      let indisponiveis = 0;
      let reconciliacao = false;

      for (const alteracao of alteracoes) {
        if (alteracao.estrutural) {
          reconciliacao = true;
          continue;
        }
        if (!alteracao.disponivel) {
          const [resultado] = await conexao.execute(
            "UPDATE materiais SET disponivel=0,ultima_sincronizacao_drive_id=? "
            + "WHERE drive_file_id=? AND disponivel=1",
            [sincronizacaoId, alteracao.fileId]
          );
          indisponiveis += Number(resultado.affectedRows);
          continue;
        }
        const [categorias] = await conexao.execute(
          "SELECT id FROM categorias WHERE drive_pasta_id=? AND ativo=1 LIMIT 1",
          [alteracao.item.parentId]
        );
        if (!categorias[0]) {
          reconciliacao = true;
          continue;
        }
        const item = alteracao.item;
        await conexao.execute(
          "INSERT INTO materiais (drive_file_id,drive_parent_file_id,categoria_id,nome,mime_type,tipo,"
          + "extensao,tamanho_bytes,checksum_md5,drive_criado_em,drive_modificado_em,resource_key,"
          + "disponivel,ultima_sincronizacao_drive_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?) AS novo "
          + "ON DUPLICATE KEY UPDATE drive_parent_file_id=novo.drive_parent_file_id,categoria_id=novo.categoria_id,"
          + "nome=novo.nome,mime_type=novo.mime_type,tipo=novo.tipo,extensao=novo.extensao,"
          + "tamanho_bytes=novo.tamanho_bytes,checksum_md5=novo.checksum_md5,drive_criado_em=novo.drive_criado_em,"
          + "drive_modificado_em=novo.drive_modificado_em,resource_key=novo.resource_key,disponivel=1,"
          + "ultima_sincronizacao_drive_id=novo.ultima_sincronizacao_drive_id",
          [
            item.id, item.parentId, Number(categorias[0].id), item.name, item.mimeType,
            identificarTipo(item.mimeType), obterExtensao(item.name),
            typeof item.size === "string" && /^\d+$/.test(item.size) ? item.size : null,
            item.md5Checksum || null, dataOuNula(item.createdTime), dataOuNula(item.modifiedTime),
            item.resourceKey || null, sincronizacaoId
          ]
        );
        atualizados += 1;
      }

      await conexao.execute(
        "UPDATE sincronizacoes_google_drive SET status='concluida',arquivos_encontrados=?,"
        + "materiais_atualizados=?,itens_indisponiveis=?,concluida_em=CURRENT_TIMESTAMP(3) WHERE id=?",
        [alteracoes.length, atualizados, indisponiveis, sincronizacaoId]
      );
      await conexao.execute(
        "UPDATE estado_changes_google_drive SET page_token=?,atualizado_em=CURRENT_TIMESTAMP(3),"
        + "ultima_verificacao_em=CURRENT_TIMESTAMP(3),ultimo_erro_codigo=NULL,"
        + "reconciliacao_necessaria=IF(reconciliacao_necessaria=1 OR ?,1,0) WHERE id=1",
        [novoPageToken, reconciliacao ? 1 : 0]
      );
      await conexao.commit();
      return { atualizados: atualizados, indisponiveis: indisponiveis, reconciliacaoNecessaria: reconciliacao };
    } catch (erro) {
      await conexao.rollback();
      throw erro;
    }
  }

  async function salvarCanal(canal, tokenHash) {
    const conexao = await pool.getConnection();
    try {
      await conexao.beginTransaction();
      await conexao.execute("UPDATE canais_google_drive SET status='substituido' WHERE status='ativo'");
      await conexao.execute(
        "INSERT INTO canais_google_drive (channel_id,resource_id,token_hash,expira_em,status,criado_em) "
        + "VALUES (?,?,?,?, 'ativo',CURRENT_TIMESTAMP(3))",
        [canal.id, canal.resourceId, tokenHash, new Date(Number(canal.expiration))]
      );
      await conexao.commit();
    } catch (erro) {
      await conexao.rollback();
      throw erro;
    } finally {
      conexao.release();
    }
  }

  async function buscarCanalAtivo() {
    const [registros] = await pool.execute(
      "SELECT channel_id,resource_id,expira_em FROM canais_google_drive "
      + "WHERE status='ativo' AND expira_em>CURRENT_TIMESTAMP(3) ORDER BY criado_em DESC LIMIT 1"
    );
    return registros[0] || null;
  }

  async function registrarNotificacao(cabecalhos, tokenHash) {
    const [canais] = await pool.execute(
      "SELECT channel_id FROM canais_google_drive WHERE channel_id=? AND resource_id=? "
      + "AND token_hash=? AND status='ativo' AND expira_em>CURRENT_TIMESTAMP(3) LIMIT 1",
      [cabecalhos.channelId, cabecalhos.resourceId, tokenHash]
    );
    if (!canais[0]) {
      throw new AppError("Notificacao Google invalida", 403, "GOOGLE_WEBHOOK_INVALIDO");
    }
    const [resultado] = await pool.execute(
      "INSERT IGNORE INTO notificacoes_google_drive "
      + "(channel_id,message_number,resource_state,recebida_em) VALUES (?,?,?,CURRENT_TIMESTAMP(3))",
      [cabecalhos.channelId, cabecalhos.messageNumber, cabecalhos.resourceState]
    );
    return resultado.affectedRows === 1;
  }

  async function marcarNotificacoesProcessadas() {
    await pool.execute(
      "UPDATE notificacoes_google_drive SET processada_em=CURRENT_TIMESTAMP(3) WHERE processada_em IS NULL"
    );
  }

  async function ehPastaConhecida(fileId) {
    const [registros] = await pool.execute(
      "SELECT id FROM categorias WHERE drive_pasta_id=? LIMIT 1",
      [fileId]
    );
    return Boolean(registros[0]);
  }

  async function marcarReconciliacaoNecessaria(codigo) {
    await pool.execute(
      "UPDATE estado_changes_google_drive SET reconciliacao_necessaria=1,ultimo_erro_codigo=?,"
      + "ultima_verificacao_em=CURRENT_TIMESTAMP(3) WHERE id=1",
      [codigo || null]
    );
  }

  async function registrarVerificacao(pageToken) {
    await pool.execute(
      "UPDATE estado_changes_google_drive SET page_token=?,atualizado_em=CURRENT_TIMESTAMP(3),"
      + "ultima_verificacao_em=CURRENT_TIMESTAMP(3),ultimo_erro_codigo=NULL WHERE id=1",
      [pageToken]
    );
  }

  return {
    adquirirTrava: adquirirTrava,
    liberarTrava: liberarTrava,
    buscarEstado: buscarEstado,
    salvarEstadoInicial: salvarEstadoInicial,
    registrarErro: registrarErro,
    aplicarAlteracoes: aplicarAlteracoes,
    salvarCanal: salvarCanal,
    buscarCanalAtivo: buscarCanalAtivo,
    registrarNotificacao: registrarNotificacao,
    marcarNotificacoesProcessadas: marcarNotificacoesProcessadas,
    ehPastaConhecida: ehPastaConhecida,
    marcarReconciliacaoNecessaria: marcarReconciliacaoNecessaria,
    registrarVerificacao: registrarVerificacao
  };
}

module.exports = criarGoogleDriveChangesRepository;
