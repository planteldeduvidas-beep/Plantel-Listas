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

  async function obterRefreshToken() {
    if (configuracao.googleDrive.refreshToken) {
      return configuracao.googleDrive.refreshToken;
    }
    const credencial = await repository.buscarCredencial();
    if (!credencial) {
      throw new AppError(
        "Google Drive ainda nao foi autorizado",
        409,
        "GOOGLE_DRIVE_NAO_AUTORIZADO"
      );
    }
    return descriptografarRefreshToken(
      credencial.refresh_token_criptografado,
      configuracao.seguranca.csrfSecret
    );
  }

  async function obterStatus() {
    const credencial = await repository.buscarCredencial();
    const ultimaSincronizacao = await repository.buscarUltimaSincronizacao();
    return {
      configurado: Boolean(provider),
      conectado: Boolean(configuracao.googleDrive.refreshToken || credencial),
      escopo: provider ? provider.escopo : configuracao.googleDrive.escopoLeitura,
      ultimaSincronizacao: ultimaSincronizacao
    };
  }

  async function sincronizar(usuarioId, corpo) {
    validarCorpoVazio(corpo);
    exigirProvider();
    const refreshToken = await obterRefreshToken();
    const conexao = await repository.adquirirTravaDeSincronizacao();
    if (!conexao) {
      throw new AppError(
        "Ja existe uma sincronizacao em andamento",
        409,
        "SINCRONIZACAO_EM_ANDAMENTO"
      );
    }

    let sincronizacaoId = null;
    try {
      sincronizacaoId = await repository.iniciarSincronizacao(conexao, usuarioId);
      const arvore = await provider.listarArvore(refreshToken);
      const resumo = await repository.aplicarSincronizacao(
        conexao,
        sincronizacaoId,
        arvore,
        provider.pastaRaizId
      );
      await repository.concluirSincronizacao(conexao, sincronizacaoId, resumo);
      if (logger) {
        logger.info({ sincronizacaoId: sincronizacaoId, resumo: resumo }, "Google Drive sincronizado");
      }
      return Object.assign({ id: sincronizacaoId, status: "concluida" }, resumo);
    } catch (erro) {
      if (sincronizacaoId) {
        try {
          await repository.falharSincronizacao(conexao, sincronizacaoId, erro.codigo);
        } catch (falhaAoRegistrar) {
          if (logger) {
            logger.error(
              { sincronizacaoId: sincronizacaoId, codigo: "FALHA_REGISTRO_SINCRONIZACAO" },
              "Nao foi possivel registrar falha da sincronizacao"
            );
          }
        }
      }
      throw erro;
    } finally {
      await repository.liberarTravaDeSincronizacao(conexao);
    }
  }

  return {
    iniciarOAuth: iniciarOAuth,
    concluirOAuth: concluirOAuth,
    obterStatus: obterStatus,
    sincronizar: sincronizar
  };
}

module.exports = criarIntegracaoGoogleDriveService;
