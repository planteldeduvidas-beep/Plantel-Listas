const AppError = require("../../shared/errors/AppError");
const { aplicarClassificacaoAutomatica } = require("./classificacaoAutomatica");

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

function criarGoogleDriveChangesRepository(pool, opcoes) {
  const nomeTravaInformado = opcoes && opcoes.nomeTrava;
  async function buscarCategoriaDrive(conexao, drivePastaId) {
    const [registros] = await conexao.execute(
      "SELECT id,drive_pasta_id,ativo,ordem FROM categorias WHERE drive_pasta_id=? LIMIT 1",
      [drivePastaId]
    );
    return registros[0] || null;
  }

  async function buscarCategoriaPorNomeNoPai(conexao, nome, categoriaPaiId) {
    const [registros] = await conexao.execute(
      "SELECT id,drive_pasta_id FROM categorias "
      + "WHERE categoria_pai_chave=IFNULL(?,0) AND nome=? LIMIT 1",
      [categoriaPaiId, nome]
    );
    return registros[0] || null;
  }

  async function salvarCategoriaDaSubarvore(conexao, pasta, categoriaPaiId, ordem, sincronizacaoId) {
    let categoria = await buscarCategoriaDrive(conexao, pasta.id);
    if (!categoria) {
      categoria = await buscarCategoriaPorNomeNoPai(conexao, pasta.name, categoriaPaiId);
      if (categoria && categoria.drive_pasta_id && categoria.drive_pasta_id !== pasta.id) {
        return null;
      }
    }
    if (categoria) {
      await conexao.execute(
        "UPDATE categorias SET nome=?,categoria_pai_id=?,drive_pasta_id=?,ordem=?,ativo=1,"
        + "ultima_sincronizacao_drive_id=? WHERE id=?",
        [pasta.name, categoriaPaiId, pasta.id, ordem, sincronizacaoId, categoria.id]
      );
      return Number(categoria.id);
    }
    const [resultado] = await conexao.execute(
      "INSERT INTO categorias (nome,descricao,categoria_pai_id,drive_pasta_id,ordem,ativo,"
      + "ultima_sincronizacao_drive_id) VALUES (?,NULL,?,?,?,1,?)",
      [pasta.name, categoriaPaiId, pasta.id, ordem, sincronizacaoId]
    );
    return Number(resultado.insertId);
  }

  async function salvarMaterial(conexao, item, categoriaId, sincronizacaoId) {
    await conexao.execute(
      "INSERT INTO materiais (drive_file_id,drive_parent_file_id,categoria_id,nome,mime_type,tipo,"
      + "extensao,tamanho_bytes,checksum_md5,drive_criado_em,drive_modificado_em,resource_key,"
      + "disponivel,ultima_sincronizacao_drive_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?) AS novo "
      + "ON DUPLICATE KEY UPDATE drive_parent_file_id=novo.drive_parent_file_id,categoria_id=novo.categoria_id,"
      + "nome=novo.nome,mime_type=novo.mime_type,tipo=novo.tipo,extensao=novo.extensao,"
      + "tamanho_bytes=novo.tamanho_bytes,checksum_md5=novo.checksum_md5,drive_criado_em=novo.drive_criado_em,"
      + "drive_modificado_em=novo.drive_modificado_em,resource_key=novo.resource_key,disponivel=IF(materiais.estado_gestao='disponivel',1,materiais.disponivel),"
      + "ultima_sincronizacao_drive_id=novo.ultima_sincronizacao_drive_id",
      [
        item.id, item.parentId, categoriaId, item.name, item.mimeType,
        identificarTipo(item.mimeType), obterExtensao(item.name),
        typeof item.size === "string" && /^\d+$/.test(item.size) ? item.size : null,
        item.md5Checksum || null, dataOuNula(item.createdTime), dataOuNula(item.modifiedTime),
        item.resourceKey || null, sincronizacaoId
      ]
    );
  }

  async function listarIdsDaSubarvore(conexao, categoriaId) {
    const [registros] = await conexao.execute(
      "WITH RECURSIVE subarvore AS (SELECT id FROM categorias WHERE id=? "
      + "UNION ALL SELECT c.id FROM categorias c INNER JOIN subarvore p ON c.categoria_pai_id=p.id) "
      + "SELECT id FROM subarvore",
      [categoriaId]
    );
    return registros.map(function obterId(item) { return Number(item.id); });
  }

  async function indisponibilizarIds(conexao, ids, sincronizacaoId, desativarPastas) {
    if (!ids.length) {
      return 0;
    }
    const marcadores = ids.map(function marcador() { return "?"; }).join(",");
    const [materiais] = await conexao.execute(
      "UPDATE materiais SET disponivel=0,ultima_sincronizacao_drive_id=? "
      + "WHERE categoria_id IN (" + marcadores + ") AND disponivel=1",
      [sincronizacaoId].concat(ids)
    );
    if (desativarPastas) {
      await conexao.execute(
        "UPDATE categorias SET ativo=0,ultima_sincronizacao_drive_id=? "
        + "WHERE id IN (" + marcadores + ") AND drive_pasta_id IS NOT NULL",
        [sincronizacaoId].concat(ids)
      );
    }
    return Number(materiais.affectedRows);
  }

  async function removerSubarvore(conexao, drivePastaId, sincronizacaoId) {
    const categoria = await buscarCategoriaDrive(conexao, drivePastaId);
    if (!categoria) {
      return 0;
    }
    return indisponibilizarIds(
      conexao,
      await listarIdsDaSubarvore(conexao, Number(categoria.id)),
      sincronizacaoId,
      true
    );
  }

  async function aplicarSubarvore(conexao, alteracao, sincronizacaoId) {
    const subarvore = alteracao.subarvore;
    const pastaRaiz = subarvore && Array.isArray(subarvore.pastas)
      ? subarvore.pastas[0]
      : null;
    if (!pastaRaiz) {
      return { segura: false, atualizados: 0, indisponiveis: 0 };
    }
    const idsDaSubarvore = new Set(subarvore.pastas.map(function obterId(pasta) {
      return pasta.id;
    }));
    if (idsDaSubarvore.has(pastaRaiz.parentId)) {
      return { segura: false, atualizados: 0, indisponiveis: 0 };
    }
    let categoriaPaiId = null;
    if (pastaRaiz.parentId !== alteracao.pastaRaizId) {
      const categoriaPai = await buscarCategoriaDrive(conexao, pastaRaiz.parentId);
      if (!categoriaPai || Number(categoriaPai.ativo) !== 1) {
        return { segura: false, atualizados: 0, indisponiveis: 0 };
      }
      categoriaPaiId = Number(categoriaPai.id);
    }

    const categoriasPorDrive = new Map();
    if (categoriaPaiId) {
      categoriasPorDrive.set(pastaRaiz.parentId, categoriaPaiId);
    }
    let atualizados = 0;
    for (let indice = 0; indice < subarvore.pastas.length; indice += 1) {
      const pasta = subarvore.pastas[indice];
      const paiId = pasta.parentId === alteracao.pastaRaizId
        ? null
        : categoriasPorDrive.get(pasta.parentId);
      if (pasta.parentId !== alteracao.pastaRaizId && !paiId) {
        return { segura: false, atualizados: atualizados, indisponiveis: 0 };
      }
      const categoriaId = await salvarCategoriaDaSubarvore(
        conexao,
        pasta,
        paiId,
        indice,
        sincronizacaoId
      );
      if (!categoriaId) {
        return { segura: false, atualizados: atualizados, indisponiveis: 0 };
      }
      categoriasPorDrive.set(pasta.id, categoriaId);
    }

    for (const arquivo of subarvore.arquivos) {
      const categoriaId = categoriasPorDrive.get(arquivo.parentId);
      if (!categoriaId) {
        return { segura: false, atualizados: atualizados, indisponiveis: 0 };
      }
      await salvarMaterial(conexao, arquivo, categoriaId, sincronizacaoId);
      atualizados += 1;
    }

    const categoriaRaizId = categoriasPorDrive.get(pastaRaiz.id);
    const ids = await listarIdsDaSubarvore(conexao, categoriaRaizId);
    if (ids.length) {
      const marcadores = ids.map(function marcador() { return "?"; }).join(",");
      const [materiaisAusentes] = await conexao.execute(
        "UPDATE materiais SET disponivel=0,ultima_sincronizacao_drive_id=? "
        + "WHERE categoria_id IN (" + marcadores + ") "
        + "AND ultima_sincronizacao_drive_id<>? AND disponivel=1",
        [sincronizacaoId].concat(ids, [sincronizacaoId])
      );
      await conexao.execute(
        "UPDATE categorias SET ativo=0,ultima_sincronizacao_drive_id=? "
        + "WHERE id IN (" + marcadores + ") AND drive_pasta_id IS NOT NULL "
        + "AND ultima_sincronizacao_drive_id<>?",
        [sincronizacaoId].concat(ids, [sincronizacaoId])
      );
      return {
        segura: true,
        atualizados: atualizados,
        indisponiveis: Number(materiaisAusentes.affectedRows)
      };
    }
    return { segura: true, atualizados: atualizados, indisponiveis: 0 };
  }

  async function aplicarPasta(conexao, alteracao, sincronizacaoId) {
    const pasta = alteracao.pasta;
    if (!pasta || !pasta.parentId || pasta.parentId === pasta.id) {
      return false;
    }
    let categoriaPaiId = null;
    if (pasta.parentId !== alteracao.pastaRaizId) {
      const categoriaPai = await buscarCategoriaDrive(conexao, pasta.parentId);
      if (!categoriaPai || Number(categoriaPai.ativo) !== 1) {
        return false;
      }
      categoriaPaiId = Number(categoriaPai.id);
    }
    const existente = await buscarCategoriaDrive(conexao, pasta.id);
    let ordem = existente ? Number(existente.ordem) : 0;
    if (!existente) {
      const [registros] = await conexao.execute(
        "SELECT COALESCE(MAX(ordem),-1)+1 AS proxima FROM categorias WHERE categoria_pai_chave=IFNULL(?,0)",
        [categoriaPaiId]
      );
      ordem = Number(registros[0].proxima);
    }
    return Boolean(await salvarCategoriaDaSubarvore(
      conexao,
      pasta,
      categoriaPaiId,
      ordem,
      sincronizacaoId
    ));
  }

  async function adquirirTrava() {
    const conexao = await pool.getConnection();
    const [registros] = await conexao.execute(
      nomeTravaInformado
        ? "SELECT GET_LOCK(?,0) AS adquirida"
        : "SELECT GET_LOCK(LEFT(CONCAT('plantel_drive_operacao_',DATABASE()),64),0) AS adquirida",
      nomeTravaInformado ? [String(nomeTravaInformado).slice(0, 64)] : []
    );
    if (Number(registros[0].adquirida) !== 1) {
      conexao.release();
      return null;
    }
    return conexao;
  }

  async function liberarTrava(conexao) {
    try {
      if (nomeTravaInformado) {
        await conexao.execute("SELECT RELEASE_LOCK(?)", [String(nomeTravaInformado).slice(0, 64)]);
      } else {
        await conexao.execute("SELECT RELEASE_LOCK(LEFT(CONCAT('plantel_drive_operacao_',DATABASE()),64))");
      }
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
        if (alteracao.fallback) {
          reconciliacao = true;
          continue;
        }
        if (alteracao.removerSubarvore) {
          indisponiveis += await removerSubarvore(
            conexao,
            alteracao.fileId,
            sincronizacaoId
          );
          continue;
        }
        if (alteracao.pasta) {
          if (await aplicarPasta(conexao, alteracao, sincronizacaoId)) {
            atualizados += 1;
          } else {
            reconciliacao = true;
          }
          continue;
        }
        if (alteracao.subarvore) {
          await conexao.query("SAVEPOINT reconciliacao_subarvore");
          const resultadoSubarvore = await aplicarSubarvore(
            conexao,
            alteracao,
            sincronizacaoId
          );
          if (resultadoSubarvore.segura) {
            await conexao.query("RELEASE SAVEPOINT reconciliacao_subarvore");
            atualizados += resultadoSubarvore.atualizados;
            indisponiveis += resultadoSubarvore.indisponiveis;
          } else {
            await conexao.query("ROLLBACK TO SAVEPOINT reconciliacao_subarvore");
            reconciliacao = true;
          }
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
        await salvarMaterial(
          conexao,
          alteracao.item,
          Number(categorias[0].id),
          sincronizacaoId
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
      await aplicarClassificacaoAutomatica(conexao);
      await conexao.commit();
      return { atualizados: atualizados, indisponiveis: indisponiveis, reconciliacaoNecessaria: reconciliacao };
    } catch (erro) {
      await conexao.rollback();
      throw erro;
    }
  }

  async function prepararCanal(canal, tokenHash) {
    await pool.execute(
      "UPDATE canais_google_drive SET status='expirado' "
      + "WHERE status='preparando' AND expira_em<=CURRENT_TIMESTAMP(3)"
    );
    await pool.execute(
      "INSERT INTO canais_google_drive (channel_id,resource_id,token_hash,expira_em,status,criado_em) "
      + "VALUES (?,NULL,?,?, 'preparando',CURRENT_TIMESTAMP(3))",
      [canal.id, tokenHash, new Date(Number(canal.expiration))]
    );
  }

  async function ativarCanal(canal) {
    const conexao = await pool.getConnection();
    try {
      await conexao.beginTransaction();
      await conexao.execute(
        "UPDATE canais_google_drive SET status='substituido' "
        + "WHERE status='ativo' AND channel_id<>?",
        [canal.id]
      );
      const [resultado] = await conexao.execute(
        "UPDATE canais_google_drive SET resource_id=?,expira_em=?,status='ativo' "
        + "WHERE channel_id=? AND status='preparando'",
        [canal.resourceId, new Date(Number(canal.expiration)), canal.id]
      );
      if (resultado.affectedRows !== 1) {
        throw new AppError("Canal Google nao pode ser ativado", 409, "GOOGLE_CANAL_INVALIDO");
      }
      await conexao.commit();
    } catch (erro) {
      await conexao.rollback();
      throw erro;
    } finally {
      conexao.release();
    }
  }

  async function falharPreparacaoCanal(channelId) {
    await pool.execute(
      "UPDATE canais_google_drive SET status='encerrado' "
      + "WHERE channel_id=? AND status='preparando'",
      [channelId]
    );
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
      "SELECT channel_id FROM canais_google_drive WHERE channel_id=? AND token_hash=? "
      + "AND expira_em>CURRENT_TIMESTAMP(3) AND ("
      + "(status='ativo' AND resource_id=?) OR "
      + "(status='preparando' AND resource_id IS NULL AND ?='sync')) LIMIT 1",
      [
        cabecalhos.channelId,
        tokenHash,
        cabecalhos.resourceId,
        cabecalhos.resourceState
      ]
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
    prepararCanal: prepararCanal,
    ativarCanal: ativarCanal,
    falharPreparacaoCanal: falharPreparacaoCanal,
    buscarCanalAtivo: buscarCanalAtivo,
    registrarNotificacao: registrarNotificacao,
    marcarNotificacoesProcessadas: marcarNotificacoesProcessadas,
    ehPastaConhecida: ehPastaConhecida,
    marcarReconciliacaoNecessaria: marcarReconciliacaoNecessaria,
    registrarVerificacao: registrarVerificacao
  };
}

module.exports = criarGoogleDriveChangesRepository;
