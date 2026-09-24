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
  const encryptionKey = configuracao.googleDrive.encryptionKey
    || configuracao.seguranca.csrfSecret;

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
      encryptionKey
    );
    await repository.salvarCredencialEReiniciarChanges(
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
          encryptionKey
        ),
        origem: "banco",
        versao: credencial.refresh_token_criptografado
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
        encryptionKey
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

  function registrarErroDaTarefa(erro, sincronizacaoId, etapa) {
    if (logger) {
      const tipos = ["Error", "TypeError", "RangeError", "SyntaxError", "AppError"];
      const tipo = tipos.includes(erro && erro.name) ? erro.name : "Error";
      // Somente localizacoes de codigo: nunca mensagem, SQL, parametros ou tokens.
      const locais = String(erro && erro.stack || "").split("\n").slice(1)
        .map(function localizar(linha) {
          const encontrado = linha.match(/([A-Za-z0-9_.-]+\.js:\d+:\d+)\)?$/);
          return encontrado ? encontrado[1] : null;
        }).filter(Boolean).slice(0, 4).join(",");
      const codigo = String(obterCodigoDoErro(erro));
      const codigoSeguro = /^[A-Z0-9_]{1,100}$/.test(codigo) ? codigo : "ERRO_SINCRONIZACAO";
      logger.error(
        {
          sincronizacaoId: sincronizacaoId,
          codigo: obterCodigoDoErro(erro)
        },
        "Falha Google Drive: etapa=" + (etapa || "worker") + " codigo=" + codigoSeguro
          + " tipo=" + tipo + " locais=" + locais
      );
    }
  }

  function obterCodigoDoErro(erro) {
    return erro && (erro.codigo || erro.code) || "ERRO_SINCRONIZACAO";
  }

  async function executarSincronizacao(sincronizacaoId, usuarioId) {
    let conexao = await repository.adquirirTravaDeSincronizacao();
    let travaAtiva = Boolean(conexao);
    if (!conexao) {
      await repository.falharSincronizacaoSemTrava(
        sincronizacaoId,
        "SINCRONIZACAO_CONCORRENTE"
      );
      return;
    }

    let credencialDeUso = null;
    let erroDoFluxo = null;
    let etapa = "iniciar";
    try {
      const assumida = await repository.marcarSincronizando(
        conexao,
        sincronizacaoId
      );
      if (!assumida) {
        return;
      }

      etapa = "credencial";
      credencialDeUso = await obterCredencialDeUso(conexao);
      etapa = "listar_drive";
      await repository.liberarTravaDeSincronizacao(conexao);
      conexao = null;
      travaAtiva = false;
      const arvore = await provider.listarArvore(credencialDeUso.refreshToken);
      etapa = "trava_gravacao";
      conexao = await repository.adquirirTravaDeSincronizacao();
      travaAtiva = Boolean(conexao);
      if (!conexao) {
        throw new AppError(
          "Nao foi possivel reservar a gravacao da sincronizacao",
          503,
          "SINCRONIZACAO_CONCORRENTE"
        );
      }
      const credencialAtual = await repository.buscarCredencial(conexao);
      if (credencialDeUso.origem === "banco"
          ? !credencialAtual || credencialAtual.refresh_token_criptografado !== credencialDeUso.versao
          : Boolean(credencialAtual)) {
        throw new AppError("A conexao Google mudou durante a sincronizacao", 503, "GOOGLE_CREDENCIAL_ALTERADA");
      }
      etapa = "gravar_banco";
      const resumo = await repository.aplicarSincronizacao(
        conexao,
        sincronizacaoId,
        arvore,
        provider.pastaRaizId
      );
      etapa = "concluir";
      await repository.concluirSincronizacao(conexao, sincronizacaoId, resumo);
      if (logger) {
        logger.info(
          { sincronizacaoId: sincronizacaoId, resumo: resumo },
          "Google Drive sincronizado"
        );
      }
    } catch (erro) {
      erroDoFluxo = erro;
      registrarErroDaTarefa(erro, sincronizacaoId, etapa);
      const codigo = obterCodigoDoErro(erro);
      try {
        if (!conexao) {
          conexao = await repository.adquirirTravaDeSincronizacao();
          travaAtiva = Boolean(conexao);
        }
        if (!conexao) {
          await repository.falharSincronizacaoSemTrava(sincronizacaoId, codigo);
          return;
        }
        if (codigo === "GOOGLE_AUTORIZACAO_INVALIDA") {
          await registrarAutorizacaoInvalida(
            credencialDeUso,
            usuarioId,
            codigo,
            conexao
          );
        }
        await repository.falharSincronizacao(
          conexao,
          sincronizacaoId,
          codigo
        );
      } catch (erroAoRegistrar) {
        throw erro;
      }
      if (logger) {
        logger.warn(
          {
            sincronizacaoId: sincronizacaoId,
            codigo: codigo
          },
          "Sincronizacao do Google Drive falhou"
        );
      }
    } finally {
      if (travaAtiva && conexao) {
        try {
          await repository.liberarTravaDeSincronizacao(conexao);
        } catch (erroAoLiberar) {
          if (!erroDoFluxo) {
            throw erroAoLiberar;
          }
        }
      }
    }
  }

  function executarTarefaAgendada(sincronizacaoId, usuarioId) {
    return executarSincronizacao(sincronizacaoId, usuarioId).catch(function tratarErro(erro) {
      registrarErroDaTarefa(erro, sincronizacaoId);
      return repository.falharSincronizacaoSemTrava(
        sincronizacaoId,
        obterCodigoDoErro(erro)
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
    const possuiCredencialDeAmbiente = Boolean(configuracao.googleDrive.refreshToken);
    if ((!credencial || credencial.renovacao_necessaria) && !possuiCredencialDeAmbiente) {
      return null;
    }
    const usuarioId = credencial && credencial.autorizado_por_usuario_id
      ? Number(credencial.autorizado_por_usuario_id)
      : null;
    const sincronizacaoId = await repository.criarSincronizacaoAguardando(
      usuarioId
    );
    if (!sincronizacaoId) {
      return null;
    }
    agendarSincronizacao(sincronizacaoId, usuarioId);
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
