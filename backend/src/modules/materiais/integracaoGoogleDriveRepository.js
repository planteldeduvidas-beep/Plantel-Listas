const AppError = require("../../shared/errors/AppError");

function mapearSincronizacao(registro) {
  if (!registro) {
    return null;
  }

  return {
    id: Number(registro.id),
    status: registro.status,
    pastasEncontradas: Number(registro.pastas_encontradas),
    arquivosEncontrados: Number(registro.arquivos_encontrados),
    materiaisCriados: Number(registro.materiais_criados),
    materiaisAtualizados: Number(registro.materiais_atualizados),
    itensIndisponiveis: Number(registro.itens_indisponiveis),
    erroCodigo: registro.erro_codigo,
    solicitadaEm: registro.solicitada_em,
    iniciadaEm: registro.iniciada_em,
    concluidaEm: registro.concluida_em
  };
}

function criarIntegracaoGoogleDriveRepository(pool) {
  async function criarEstadoOAuth(estadoHash, usuarioId) {
    await pool.execute(
      "DELETE FROM estados_oauth_google_drive WHERE expira_em < CURRENT_TIMESTAMP(3) OR consumido_em IS NOT NULL"
    );
    await pool.execute(
      "INSERT INTO estados_oauth_google_drive (estado_hash, usuario_id, expira_em) "
      + "VALUES (?, ?, DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL 10 MINUTE))",
      [estadoHash, usuarioId]
    );
  }

  async function consumirEstadoOAuth(estadoHash, usuarioId) {
    const [resultado] = await pool.execute(
      "UPDATE estados_oauth_google_drive SET consumido_em = CURRENT_TIMESTAMP(3) "
      + "WHERE estado_hash = ? AND usuario_id = ? AND consumido_em IS NULL "
      + "AND expira_em > CURRENT_TIMESTAMP(3)",
      [estadoHash, usuarioId]
    );
    return resultado.affectedRows === 1;
  }

  async function salvarCredencial(refreshTokenCriptografado, escopo, usuarioId, executorInformado) {
    const executor = executorInformado || pool;
    await executor.execute(
      "INSERT INTO credenciais_google_drive "
      + "(id, refresh_token_criptografado, escopo, renovacao_necessaria, erro_codigo, "
      + "invalidada_em, autorizado_por_usuario_id, autorizado_em) "
      + "VALUES (1, ?, ?, 0, NULL, NULL, ?, CURRENT_TIMESTAMP(3)) AS nova "
      + "ON DUPLICATE KEY UPDATE refresh_token_criptografado = nova.refresh_token_criptografado, "
      + "escopo = nova.escopo, renovacao_necessaria = 0, erro_codigo = NULL, "
      + "invalidada_em = NULL, autorizado_por_usuario_id = nova.autorizado_por_usuario_id, "
      + "autorizado_em = nova.autorizado_em",
      [refreshTokenCriptografado, escopo, usuarioId]
    );
  }

  async function marcarCredencialParaRenovacao(codigo, executorInformado) {
    const executor = executorInformado || pool;
    await executor.execute(
      "UPDATE credenciais_google_drive SET renovacao_necessaria = 1, erro_codigo = ?, "
      + "invalidada_em = CURRENT_TIMESTAMP(3) WHERE id = 1",
      [String(codigo || "GOOGLE_AUTORIZACAO_INVALIDA").slice(0, 100)]
    );
  }

  async function buscarCredencial(executorInformado) {
    const executor = executorInformado || pool;
    const [registros] = await executor.execute(
      "SELECT refresh_token_criptografado, escopo, renovacao_necessaria, erro_codigo, "
      + "invalidada_em, autorizado_em "
      + "FROM credenciais_google_drive WHERE id = 1 LIMIT 1"
    );
    return registros[0] || null;
  }

  async function buscarUltimaSincronizacao() {
    const [registros] = await pool.execute(
      "SELECT id, status, pastas_encontradas, arquivos_encontrados, materiais_criados, "
      + "materiais_atualizados, itens_indisponiveis, erro_codigo, solicitada_em, "
      + "iniciada_em, concluida_em "
      + "FROM sincronizacoes_google_drive ORDER BY id DESC LIMIT 1"
    );
    return mapearSincronizacao(registros[0]);
  }

  async function adquirirTravaDeSincronizacao() {
    const conexao = await pool.getConnection();
    try {
      const [registros] = await conexao.execute(
        "SELECT GET_LOCK('plantel_listas_google_drive_sync', 0) AS adquirida"
      );
      if (Number(registros[0].adquirida) !== 1) {
        conexao.release();
        return null;
      }
      return conexao;
    } catch (erro) {
      conexao.release();
      throw erro;
    }
  }

  async function liberarTravaDeSincronizacao(conexao) {
    try {
      await conexao.execute("SELECT RELEASE_LOCK('plantel_listas_google_drive_sync')");
    } finally {
      conexao.release();
    }
  }

  async function criarSincronizacaoAguardando(usuarioId) {
    const conexao = await pool.getConnection();
    let travaAdquirida = false;
    try {
      const [trava] = await conexao.execute(
        "SELECT GET_LOCK('plantel_listas_google_drive_agendamento', 5) AS adquirida"
      );
      travaAdquirida = Number(trava[0].adquirida) === 1;
      if (!travaAdquirida) {
        return null;
      }

      const [ativas] = await conexao.execute(
        "SELECT id FROM sincronizacoes_google_drive "
        + "WHERE status IN ('aguardando', 'sincronizando') ORDER BY id DESC LIMIT 1"
      );
      if (ativas.length > 0) {
        return null;
      }

      const [resultado] = await conexao.execute(
        "INSERT INTO sincronizacoes_google_drive "
        + "(iniciado_por_usuario_id, status, solicitada_em) "
        + "VALUES (?, 'aguardando', CURRENT_TIMESTAMP(3))",
        [usuarioId]
      );
      return Number(resultado.insertId);
    } finally {
      try {
        if (travaAdquirida) {
          await conexao.execute(
            "SELECT RELEASE_LOCK('plantel_listas_google_drive_agendamento')"
          );
        }
      } finally {
        conexao.release();
      }
    }
  }

  async function marcarSincronizando(conexao, sincronizacaoId) {
    const [resultado] = await conexao.execute(
      "UPDATE sincronizacoes_google_drive SET status = 'sincronizando', "
      + "iniciada_em = CURRENT_TIMESTAMP(3), erro_codigo = NULL "
      + "WHERE id = ? AND status = 'aguardando'",
      [sincronizacaoId]
    );
    return resultado.affectedRows === 1;
  }

  async function concluirSincronizacao(conexao, sincronizacaoId, resumo) {
    await conexao.execute(
      "UPDATE sincronizacoes_google_drive SET status = 'concluida', "
      + "pastas_encontradas = ?, arquivos_encontrados = ?, materiais_criados = ?, "
      + "materiais_atualizados = ?, itens_indisponiveis = ?, concluida_em = CURRENT_TIMESTAMP(3) "
      + "WHERE id = ? AND status = 'sincronizando'",
      [
        resumo.pastasEncontradas,
        resumo.arquivosEncontrados,
        resumo.materiaisCriados,
        resumo.materiaisAtualizados,
        resumo.itensIndisponiveis,
        sincronizacaoId
      ]
    );
  }

  async function falharSincronizacao(conexao, sincronizacaoId, codigo) {
    await conexao.execute(
      "UPDATE sincronizacoes_google_drive SET status = 'falhou', erro_codigo = ?, "
      + "concluida_em = CURRENT_TIMESTAMP(3) "
      + "WHERE id = ? AND status IN ('aguardando', 'sincronizando')",
      [String(codigo || "ERRO_SINCRONIZACAO").slice(0, 100), sincronizacaoId]
    );
  }

  async function falharSincronizacaoSemTrava(sincronizacaoId, codigo) {
    await falharSincronizacao(pool, sincronizacaoId, codigo);
  }

  async function encerrarSincronizacoesInterrompidas(conexao) {
    const [resultado] = await conexao.execute(
      "UPDATE sincronizacoes_google_drive SET status = 'falhou', "
      + "erro_codigo = 'SINCRONIZACAO_INTERROMPIDA', concluida_em = CURRENT_TIMESTAMP(3) "
      + "WHERE status IN ('aguardando', 'sincronizando')"
    );
    return Number(resultado.affectedRows);
  }

  async function buscarCategoriaDrive(conexao, drivePastaId) {
    const [registros] = await conexao.execute(
      "SELECT id, drive_pasta_id FROM categorias WHERE drive_pasta_id = ? LIMIT 1",
      [drivePastaId]
    );
    return registros[0] || null;
  }

  async function buscarCategoriaPorNomeNoPai(conexao, nome, categoriaPaiId) {
    const [registros] = await conexao.execute(
      "SELECT id, drive_pasta_id FROM categorias "
      + "WHERE categoria_pai_chave = IFNULL(?, 0) AND nome = ? LIMIT 1",
      [categoriaPaiId, nome]
    );
    return registros[0] || null;
  }

  async function sincronizarCategoria(conexao, pasta, categoriaPaiId, ordem, sincronizacaoId) {
    let categoria = await buscarCategoriaDrive(conexao, pasta.id);

    if (!categoria) {
      categoria = await buscarCategoriaPorNomeNoPai(conexao, pasta.name, categoriaPaiId);
      if (categoria && categoria.drive_pasta_id && categoria.drive_pasta_id !== pasta.id) {
        throw new AppError(
          "Conflito entre uma pasta do Drive e a estrutura cadastrada",
          409,
          "CONFLITO_CATEGORIA_DRIVE"
        );
      }
    }

    if (categoria) {
      await conexao.execute(
        "UPDATE categorias SET nome = ?, categoria_pai_id = ?, drive_pasta_id = ?, "
        + "ordem = ?, ativo = 1, ultima_sincronizacao_drive_id = ? WHERE id = ?",
        [pasta.name, categoriaPaiId, pasta.id, ordem, sincronizacaoId, categoria.id]
      );
      return Number(categoria.id);
    }

    const [resultado] = await conexao.execute(
      "INSERT INTO categorias "
      + "(nome, descricao, categoria_pai_id, drive_pasta_id, ordem, ativo, ultima_sincronizacao_drive_id) "
      + "VALUES (?, NULL, ?, ?, ?, 1, ?)",
      [pasta.name, categoriaPaiId, pasta.id, ordem, sincronizacaoId]
    );
    return Number(resultado.insertId);
  }

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
    const correspondencia = typeof nome === "string" ? nome.match(/\.([a-zA-Z0-9]{1,30})$/) : null;
    return correspondencia ? correspondencia[1].toLowerCase() : null;
  }

  function converterData(valor) {
    if (!valor) {
      return null;
    }
    const data = new Date(valor);
    return Number.isNaN(data.getTime()) ? null : data;
  }

  function converterTamanho(valor) {
    return typeof valor === "string" && /^\d+$/.test(valor) ? valor : null;
  }

  async function sincronizarMaterial(conexao, arquivo, categoriaId, sincronizacaoId) {
    const [existentes] = await conexao.execute(
      "SELECT id FROM materiais WHERE drive_file_id = ? LIMIT 1",
      [arquivo.id]
    );
    const valores = [
      arquivo.id,
      arquivo.parentId,
      categoriaId,
      arquivo.name,
      arquivo.mimeType,
      identificarTipo(arquivo.mimeType),
      obterExtensao(arquivo.name),
      converterTamanho(arquivo.size),
      arquivo.md5Checksum || null,
      converterData(arquivo.createdTime),
      converterData(arquivo.modifiedTime),
      arquivo.webViewLink || null,
      arquivo.resourceKey || null,
      sincronizacaoId
    ];

    await conexao.execute(
      "INSERT INTO materiais "
      + "(drive_file_id, drive_parent_file_id, categoria_id, nome, mime_type, tipo, extensao, "
      + "tamanho_bytes, checksum_md5, drive_criado_em, drive_modificado_em, web_view_link, "
      + "resource_key, disponivel, ultima_sincronizacao_drive_id) "
      + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?) AS novo "
      + "ON DUPLICATE KEY UPDATE drive_parent_file_id = novo.drive_parent_file_id, "
      + "categoria_id = novo.categoria_id, nome = novo.nome, mime_type = novo.mime_type, "
      + "tipo = novo.tipo, extensao = novo.extensao, tamanho_bytes = novo.tamanho_bytes, "
      + "checksum_md5 = novo.checksum_md5, drive_criado_em = novo.drive_criado_em, "
      + "drive_modificado_em = novo.drive_modificado_em, web_view_link = novo.web_view_link, "
      + "resource_key = novo.resource_key, disponivel = 1, "
      + "ultima_sincronizacao_drive_id = novo.ultima_sincronizacao_drive_id",
      valores
    );
    return existentes.length === 0 ? "criado" : "atualizado";
  }

  async function aplicarSincronizacao(conexao, sincronizacaoId, arvore, pastaRaizId) {
    const categoriasPorDriveId = new Map([[pastaRaizId, null]]);
    const ordemPorPai = new Map();
    let materiaisCriados = 0;
    let materiaisAtualizados = 0;

    await conexao.beginTransaction();
    try {
      for (const pasta of arvore.pastas) {
        if (!categoriasPorDriveId.has(pasta.parentId)) {
          throw new AppError(
            "Arvore do Google Drive inconsistente",
            502,
            "GOOGLE_DRIVE_ARVORE_INVALIDA"
          );
        }
        const categoriaPaiId = categoriasPorDriveId.get(pasta.parentId);
        const chavePai = pasta.parentId;
        const ordem = (ordemPorPai.get(chavePai) || 0) + 1;
        ordemPorPai.set(chavePai, ordem);
        const categoriaId = await sincronizarCategoria(
          conexao,
          pasta,
          categoriaPaiId,
          ordem,
          sincronizacaoId
        );
        categoriasPorDriveId.set(pasta.id, categoriaId);
      }

      for (const arquivo of arvore.arquivos) {
        const categoriaId = categoriasPorDriveId.has(arquivo.parentId)
          ? categoriasPorDriveId.get(arquivo.parentId)
          : null;
        const resultado = await sincronizarMaterial(
          conexao,
          arquivo,
          categoriaId,
          sincronizacaoId
        );
        if (resultado === "criado") {
          materiaisCriados += 1;
        } else {
          materiaisAtualizados += 1;
        }
      }

      const [materiaisIndisponiveis] = await conexao.execute(
        "UPDATE materiais SET disponivel = 0 "
        + "WHERE disponivel = 1 AND ultima_sincronizacao_drive_id <> ?",
        [sincronizacaoId]
      );
      await conexao.execute(
        "UPDATE categorias SET ativo = 0 "
        + "WHERE drive_pasta_id IS NOT NULL AND ultima_sincronizacao_drive_id <> ?",
        [sincronizacaoId]
      );
      await conexao.commit();

      return {
        pastasEncontradas: arvore.pastas.length,
        arquivosEncontrados: arvore.arquivos.length,
        materiaisCriados: materiaisCriados,
        materiaisAtualizados: materiaisAtualizados,
        itensIndisponiveis: Number(materiaisIndisponiveis.affectedRows)
      };
    } catch (erro) {
      await conexao.rollback();
      throw erro;
    }
  }

  return {
    criarEstadoOAuth: criarEstadoOAuth,
    consumirEstadoOAuth: consumirEstadoOAuth,
    salvarCredencial: salvarCredencial,
    marcarCredencialParaRenovacao: marcarCredencialParaRenovacao,
    buscarCredencial: buscarCredencial,
    buscarUltimaSincronizacao: buscarUltimaSincronizacao,
    adquirirTravaDeSincronizacao: adquirirTravaDeSincronizacao,
    liberarTravaDeSincronizacao: liberarTravaDeSincronizacao,
    criarSincronizacaoAguardando: criarSincronizacaoAguardando,
    marcarSincronizando: marcarSincronizando,
    concluirSincronizacao: concluirSincronizacao,
    falharSincronizacao: falharSincronizacao,
    falharSincronizacaoSemTrava: falharSincronizacaoSemTrava,
    encerrarSincronizacoesInterrompidas: encerrarSincronizacoesInterrompidas,
    aplicarSincronizacao: aplicarSincronizacao
  };
}

module.exports = criarIntegracaoGoogleDriveRepository;
