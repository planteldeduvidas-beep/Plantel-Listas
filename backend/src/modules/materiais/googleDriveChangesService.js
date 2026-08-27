const crypto = require("node:crypto");
const AppError = require("../../shared/errors/AppError");
const { gerarTokenAleatorio, gerarHashDoToken } = require("../../shared/utils/tokens");
const { MIME_PASTA } = require("../../shared/providers/googleDriveProvider");

function criarGoogleDriveChangesService(dependencias) {
  const repository = dependencias.repository;
  const provider = dependencias.provider;
  const integracaoService = dependencias.integracaoService;
  const configuracao = dependencias.configuracao;
  const logger = dependencias.logger;
  const agendarTarefa = dependencias.agendarTarefa || setImmediate;
  let temporizador = null;

  function exigirProvider() {
    if (!provider) {
      throw new AppError("Google Drive nao configurado", 503, "GOOGLE_DRIVE_NAO_CONFIGURADO");
    }
  }

  async function obterEstadoPreparado() {
    let estado = await repository.buscarEstado();
    if (!estado) {
      const refreshToken = await integracaoService.obterRefreshTokenParaUso();
      const pageToken = await provider.obterInicioDasAlteracoes(refreshToken);
      await repository.salvarEstadoInicial(pageToken);
      estado = await repository.buscarEstado();
    }
    return estado;
  }

  async function prepararAlteracao(refreshToken, alteracao) {
    const item = alteracao.file;
    if (alteracao.removed || !item || item.trashed) {
      return {
        fileId: alteracao.fileId,
        disponivel: false,
        estrutural: item ? item.mimeType === MIME_PASTA : await repository.ehPastaConhecida(alteracao.fileId)
      };
    }
    if (item.mimeType === MIME_PASTA) {
      return { fileId: item.id, disponivel: true, estrutural: true };
    }
    const dentroDaRaiz = await provider.verificarDescendenteDaRaiz(refreshToken, item);
    return {
      fileId: item.id,
      disponivel: dentroDaRaiz,
      estrutural: false,
      item: dentroDaRaiz ? Object.assign({}, item, { parentId: item.parents[0] }) : null
    };
  }

  async function processarAlteracoes() {
    exigirProvider();
    const conexao = await repository.adquirirTrava();
    if (!conexao) {
      return { processando: true };
    }
    try {
      const estado = await obterEstadoPreparado();
      const refreshToken = await integracaoService.obterRefreshTokenParaUso();
      let pageToken = estado.page_token;
      let resposta;
      const alteracoesPreparadas = [];
      do {
        resposta = await provider.listarAlteracoes(refreshToken, pageToken);
        for (const alteracao of resposta.changes || []) {
          alteracoesPreparadas.push(await prepararAlteracao(refreshToken, alteracao));
        }
        pageToken = resposta.nextPageToken || resposta.newStartPageToken || pageToken;
      } while (resposta.nextPageToken);
      const tokenFinal = resposta.newStartPageToken || pageToken;
      const resumo = alteracoesPreparadas.length > 0
        ? await repository.aplicarAlteracoes(conexao, alteracoesPreparadas, tokenFinal)
        : (await repository.registrarVerificacao(tokenFinal), {
          atualizados: 0,
          indisponiveis: 0,
          reconciliacaoNecessaria: false
        });
      if (resumo.reconciliacaoNecessaria) {
        await integracaoService.solicitarSincronizacaoAutomatica();
      }
      await repository.marcarNotificacoesProcessadas();
      return resumo;
    } catch (erro) {
      if (erro.codigo === "GOOGLE_PAGE_TOKEN_EXPIRADO") {
        const refreshToken = await integracaoService.obterRefreshTokenParaUso();
        await repository.salvarEstadoInicial(await provider.obterInicioDasAlteracoes(refreshToken));
        await repository.marcarReconciliacaoNecessaria("GOOGLE_PAGE_TOKEN_EXPIRADO");
      } else {
        await repository.registrarErro(erro.codigo);
        if (erro.codigo === "GOOGLE_AUTORIZACAO_INVALIDA") {
          await integracaoService.registrarFalhaDeAutorizacao(erro.codigo);
        }
      }
      throw erro;
    } finally {
      await repository.liberarTrava(conexao);
    }
  }

  function agendarProcessamento() {
    agendarTarefa(function executar() {
      return processarAlteracoes().catch(function registrar(erro) {
        if (logger) {
          logger.warn({ codigo: erro.codigo || "GOOGLE_CHANGES_FALHOU" }, "Processamento de alteracoes do Drive falhou");
        }
      });
    });
  }

  function validarCabecalhos(headers) {
    const dados = {
      channelId: headers["x-goog-channel-id"],
      resourceId: headers["x-goog-resource-id"],
      messageNumber: headers["x-goog-message-number"],
      resourceState: headers["x-goog-resource-state"],
      token: headers["x-goog-channel-token"]
    };
    if (!/^[0-9a-f-]{36}$/i.test(dados.channelId || "")
        || !/^[A-Za-z0-9_-]{1,255}$/.test(dados.resourceId || "")
        || !/^\d{1,40}$/.test(dados.messageNumber || "")
        || !/^[a-z_]{1,40}$/i.test(dados.resourceState || "")
        || typeof dados.token !== "string"
        || dados.token.length < 32
        || dados.token.length > 256) {
      throw new AppError("Notificacao Google invalida", 403, "GOOGLE_WEBHOOK_INVALIDO");
    }
    return dados;
  }

  async function receberNotificacao(headers) {
    const dados = validarCabecalhos(headers);
    const nova = await repository.registrarNotificacao(dados, gerarHashDoToken(dados.token));
    if (nova && dados.resourceState !== "sync") {
      agendarProcessamento();
    }
    return { aceita: true, duplicada: !nova };
  }

  async function renovarCanal() {
    exigirProvider();
    if (!configuracao.googleDrive.webhookUrl) {
      return { configurado: false };
    }
    const estado = await obterEstadoPreparado();
    const refreshToken = await integracaoService.obterRefreshTokenParaUso();
    const anterior = await repository.buscarCanalAtivo();
    const agora = Date.now();
    if (anterior && new Date(anterior.expira_em).getTime() - agora > 24 * 60 * 60 * 1000) {
      return { configurado: true, ativo: true, expiraEm: anterior.expira_em };
    }
    const token = gerarTokenAleatorio();
    const canal = {
      id: crypto.randomUUID(),
      address: configuracao.googleDrive.webhookUrl,
      token: token,
      expiration: agora + (6 * 24 * 60 * 60 * 1000)
    };
    const resposta = await provider.observarAlteracoes(refreshToken, estado.page_token, canal);
    await repository.salvarCanal({
      id: canal.id,
      resourceId: resposta.resourceId,
      expiration: resposta.expiration || canal.expiration
    }, gerarHashDoToken(token));
    if (anterior) {
      provider.encerrarCanal(refreshToken, anterior.channel_id, anterior.resource_id)
        .catch(function ignorarFalhaDeEncerramento() {});
    }
    return { configurado: true, ativo: true, expiraEm: new Date(Number(resposta.expiration || canal.expiration)) };
  }

  async function obterStatus() {
    const estado = await repository.buscarEstado();
    const canal = await repository.buscarCanalAtivo();
    return {
      acompanhamentoAtivo: Boolean(estado),
      webhookConfigurado: Boolean(configuracao.googleDrive.webhookUrl),
      canalAtivo: Boolean(canal),
      canalExpiraEm: canal ? canal.expira_em : null,
      reconciliacaoNecessaria: Boolean(estado && estado.reconciliacao_necessaria),
      ultimaVerificacaoEm: estado ? estado.ultima_verificacao_em : null
    };
  }

  function iniciarMonitor() {
    if (temporizador || !provider) {
      return;
    }
    agendarProcessamento();
    renovarCanal().catch(function ignorarCanalSemConfiguracao() {});
    temporizador = setInterval(function verificar() {
      agendarProcessamento();
      renovarCanal().catch(function ignorarFalhaTemporaria() {});
    }, configuracao.googleDrive.intervaloChangesMs);
    if (typeof temporizador.unref === "function") {
      temporizador.unref();
    }
  }

  return {
    receberNotificacao: receberNotificacao,
    processarAlteracoes: processarAlteracoes,
    renovarCanal: renovarCanal,
    obterStatus: obterStatus,
    iniciarMonitor: iniciarMonitor
  };
}

module.exports = criarGoogleDriveChangesService;
