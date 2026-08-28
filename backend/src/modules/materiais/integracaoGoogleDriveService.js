const AppError = require("../../shared/errors/AppError");
const { gerarTokenAleatorio, gerarHashDoToken } = require("../../shared/utils/tokens");
const {
  criptografarRefreshToken,
  descriptografarRefreshToken
} = require("../../shared/providers/googleDriveProvider");
const {
  validarCorpoVazio,
  validarCallbackOAuth
} = require("./integracaoGoogleDriveValidator");

function criarIntegracaoGoogleDriveService(dependencias) {
  const repository = dependencias.repository;
  const provider = dependencias.provider;
  const configuracao = dependencias.configuracao;
  const logger = dependencias.logger;
  const agendarTarefa = dependencias.agendarTarefa || setImmediate;

  function exigirProvider() {
    if (!provider) {
      throw new AppError(
        "Integracao com Google Drive nao configurada",
        503,
        "GOOGLE_DRIVE_NAO_CONFIGURADO"
      );
    }
  }

  async function iniciarOAuth(usuarioId, corpo) {
    validarCorpoVazio(corpo);
    exigirProvider();
    const estado = gerarTokenAleatorio();
    const estadoHash = gerarHashDoToken(estado);
    await repository.criarEstadoOAuth(estadoHash, usuarioId);
    return { urlAutorizacao: provider.gerarUrlAutorizacao(estado) };
  }

  async function concluirOAuth(usuarioId, query) {
    exigirProvider();
    const dados = validarCallbackOAuth(query);
    const estadoValido = await repository.consumirEstadoOAuth(
      gerarHashDoToken(dados.estado),
      usuarioId
    );
    if (!estadoValido) {
      throw new AppError(
        "Estado OAuth expirado ou ja utilizado",
        400,
        "GOOGLE_ESTADO_INVALIDO"
      );
    }

    const refreshToken = await provider.trocarCodigoPorRefreshToken(dados.codigo);
    const tokenCriptografado = criptografarRefreshToken(
      refreshToken,
      configuracao.seguranca.csrfSecret
    );
    await repository.salvarCredencial(
      tokenCriptografado,
      provider.escopo,
      usuarioId
    );
    return { conectado: true };
  }

  async function obterCredencialDeUso(executor) {
    const credencial = await repository.buscarCredencial(executor);
    if (credencial && (credencial.renovacao_necessaria
        || (provider && credencial.escopo !== provider.escopo))) {
      throw new AppError(
        "A conexao com o Google Drive precisa ser renovada",
        409,
        "GOOGLE_RECONEXAO_NECESSARIA"
      );
    }
    if (credencial) {
      return {
        refreshToken: descriptografarRefreshToken(
          credencial.refresh_token_criptografado,
          configuracao.seguranca.csrfSecret
        ),
        origem: "banco"
      };
    }
    if (configuracao.googleDrive.refreshToken) {
      return {
        refreshToken: configuracao.googleDrive.refreshToken,
        origem: "ambiente"
      };
    }
    throw new AppError(
      "Google Drive ainda nao foi autorizado",
      409,
      "GOOGLE_DRIVE_NAO_AUTORIZADO"
    );
  }

  async function registrarAutorizacaoInvalida(
    credencialDeUso,
    usuarioId,
    codigo,
    conexao
  ) {
    if (credencialDeUso && credencialDeUso.origem === "ambiente") {
      const tokenCriptografado = criptografarRefreshToken(
        credencialDeUso.refreshToken,
        configuracao.seguranca.csrfSecret
      );
      await repository.salvarCredencial(
        tokenCriptografado,
        provider.escopo,
        usuarioId,
        conexao
      );
    }
    await repository.marcarCredencialParaRenovacao(codigo, conexao);
  }

  function registrarErroDaTarefa(erro, sincronizacaoId) {
    if (logger) {
      logger.error(
        {
          sincronizacaoId: sincronizacaoId,
          codigo: erro.codigo || "ERRO_SINCRONIZACAO"
        },
        "Falha inesperada no worker do Google Drive"
      );
    }
  }

  async function executarSincronizacao(sincronizacaoId, usuarioId) {
    const conexao = await repository.adquirirTravaDeSincronizacao();
    if (!conexao) {
      await repository.falharSincronizacaoSemTrava(
        sincronizacaoId,
        "SINCRONIZACAO_CONCORRENTE"
      );
      return;
    }

    let credencialDeUso = null;
    try {
      const assumida = await repository.marcarSincronizando(
        conexao,
        sincronizacaoId
      );
      if (!assumida) {
        return;
      }

      credencialDeUso = await obterCredencialDeUso(conexao);
      const arvore = await provider.listarArvore(credencialDeUso.refreshToken);
      const resumo = await repository.aplicarSincronizacao(
        conexao,
        sincronizacaoId,
        arvore,
        provider.pastaRaizId
      );
      await repository.concluirSincronizacao(conexao, sincronizacaoId, resumo);
      if (logger) {
        logger.info(
          { sincronizacaoId: sincronizacaoId, resumo: resumo },
          "Google Drive sincronizado"
        );
      }
    } catch (erro) {
      if (erro.codigo === "GOOGLE_AUTORIZACAO_INVALIDA") {
        await registrarAutorizacaoInvalida(
          credencialDeUso,
          usuarioId,
          erro.codigo,
          conexao
        );
      }
      await repository.falharSincronizacao(
        conexao,
        sincronizacaoId,
        erro.codigo
      );
      if (logger) {
        logger.warn(
          {
            sincronizacaoId: sincronizacaoId,
            codigo: erro.codigo || "ERRO_SINCRONIZACAO"
          },
          "Sincronizacao do Google Drive falhou"
        );
      }
    } finally {
      await repository.liberarTravaDeSincronizacao(conexao);
    }
  }

  function executarTarefaAgendada(sincronizacaoId, usuarioId) {
    return executarSincronizacao(sincronizacaoId, usuarioId).catch(function tratarErro(erro) {
      registrarErroDaTarefa(erro, sincronizacaoId);
      return repository.falharSincronizacaoSemTrava(
        sincronizacaoId,
        erro.codigo
      ).catch(function registrarFalha(erroAoRegistrar) {
        registrarErroDaTarefa(erroAoRegistrar, sincronizacaoId);
      });
    });
  }

  function agendarSincronizacao(sincronizacaoId, usuarioId) {
    agendarTarefa(function iniciarTarefa() {
      return executarTarefaAgendada(sincronizacaoId, usuarioId);
    });
  }

  async function solicitarSincronizacao(usuarioId, corpo) {
    validarCorpoVazio(corpo);
    exigirProvider();
    await obterCredencialDeUso();
    const sincronizacaoId = await repository.criarSincronizacaoAguardando(usuarioId);
    if (!sincronizacaoId) {
      throw new AppError(
        "Ja existe uma sincronizacao em andamento",
        409,
        "SINCRONIZACAO_EM_ANDAMENTO"
      );
    }

    try {
      agendarSincronizacao(sincronizacaoId, usuarioId);
    } catch (erro) {
      await repository.falharSincronizacaoSemTrava(
        sincronizacaoId,
        "FALHA_AGENDAMENTO_SINCRONIZACAO"
      );
      throw new AppError(
        "Nao foi possivel iniciar a sincronizacao",
        503,
        "FALHA_AGENDAMENTO_SINCRONIZACAO"
      );
    }
    return { id: sincronizacaoId, status: "aguardando" };
  }

  async function solicitarSincronizacaoAutomatica() {
    exigirProvider();
    const credencial = await repository.buscarCredencial();
    if (!credencial || !credencial.autorizado_por_usuario_id) {
      return null;
    }
    const sincronizacaoId = await repository.criarSincronizacaoAguardando(
      Number(credencial.autorizado_por_usuario_id)
    );
    if (!sincronizacaoId) {
      return null;
    }
    agendarSincronizacao(sincronizacaoId, Number(credencial.autorizado_por_usuario_id));
    return sincronizacaoId;
  }

  async function recuperarSincronizacoesInterrompidas() {
    const conexao = await repository.adquirirTravaDeSincronizacao();
    if (!conexao) {
      return 0;
    }
    try {
      const quantidade = await repository.encerrarSincronizacoesInterrompidas(conexao);
      if (quantidade > 0 && logger) {
        logger.warn(
          { quantidade: quantidade, codigo: "SINCRONIZACAO_INTERROMPIDA" },
          "Sincronizacoes interrompidas foram encerradas"
        );
      }
      return quantidade;
    } finally {
      await repository.liberarTravaDeSincronizacao(conexao);
    }
  }

  async function obterStatus() {
    const credencial = await repository.buscarCredencial();
    const ultimaSincronizacao = await repository.buscarUltimaSincronizacao();
    const renovacaoNecessaria = Boolean(
      credencial && (credencial.renovacao_necessaria
        || (provider && credencial.escopo !== provider.escopo))
    );
    return {
      configurado: Boolean(provider),
      conectado: Boolean(
        (configuracao.googleDrive.refreshToken || credencial)
        && !renovacaoNecessaria
      ),
      renovacaoNecessaria: renovacaoNecessaria,
      escopo: provider ? provider.escopo : configuracao.googleDrive.escopo,
      ultimaSincronizacao: ultimaSincronizacao
    };
  }

  return {
    iniciarOAuth: iniciarOAuth,
    concluirOAuth: concluirOAuth,
    obterStatus: obterStatus,
    solicitarSincronizacao: solicitarSincronizacao,
    recuperarSincronizacoesInterrompidas: recuperarSincronizacoesInterrompidas,
    obterRefreshTokenParaUso: async function obterRefreshTokenParaUso() {
      exigirProvider();
      const credencial = await obterCredencialDeUso();
      return credencial.refreshToken;
    },
    registrarFalhaDeAutorizacao: async function registrarFalhaDeAutorizacao(codigo) {
      await repository.marcarCredencialParaRenovacao(codigo);
    },
    solicitarSincronizacaoAutomatica: solicitarSincronizacaoAutomatica
  };
}

module.exports = criarIntegracaoGoogleDriveService;
