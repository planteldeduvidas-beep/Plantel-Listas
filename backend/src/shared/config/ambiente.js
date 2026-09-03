const path = require("node:path");
const dotenv = require("dotenv");

const CAMINHO_ENV_PADRAO = path.resolve(__dirname, "../../../.env");

function carregarArquivoDeAmbiente() {
  const caminhoEnv = process.env.ENV_FILE || CAMINHO_ENV_PADRAO;
  dotenv.config({ path: caminhoEnv, quiet: true });
}

function exigirTexto(variaveis, nome) {
  const valor = variaveis[nome];

  if (typeof valor !== "string" || valor.trim() === "") {
    throw new Error("Variavel de ambiente obrigatoria ausente: " + nome);
  }

  return valor.trim();
}

function lerInteiro(variaveis, nome, valorPadrao, minimo, maximo) {
  const valorInformado = variaveis[nome];
  const valor = valorInformado === undefined || valorInformado === ""
    ? valorPadrao
    : Number(valorInformado);

  if (!Number.isInteger(valor) || valor < minimo || valor > maximo) {
    throw new Error("Variavel de ambiente invalida: " + nome);
  }

  return valor;
}

function validarNomeDoBanco(nomeDoBanco) {
  if (!/^[a-zA-Z0-9_]+$/.test(nomeDoBanco)) {
    throw new Error("Variavel de ambiente invalida: DB_NAME");
  }

  return nomeDoBanco;
}

function exigirSegredo(variaveis, nome) {
  const valor = exigirTexto(variaveis, nome);

  if (valor.length < 32) {
    throw new Error("Variavel de ambiente deve ter pelo menos 32 caracteres: " + nome);
  }

  return valor;
}

function lerTextoOpcional(variaveis, nome) {
  const valor = variaveis[nome];
  return typeof valor === "string" ? valor.trim() : "";
}

function lerBooleano(variaveis, nome, valorPadrao) {
  const valor = lerTextoOpcional(variaveis, nome).toLowerCase();

  if (valor === "") {
    return valorPadrao;
  }

  if (valor === "true") {
    return true;
  }

  if (valor === "false") {
    return false;
  }

  throw new Error("Variavel de ambiente invalida: " + nome);
}

function validarUrlOpcional(valor, nome, ambiente) {
  if (!valor) {
    return "";
  }

  let url;
  try {
    url = new URL(valor);
  } catch (erro) {
    throw new Error("Variavel de ambiente invalida: " + nome);
  }

  const localhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(ambiente !== "production" && url.protocol === "http:" && localhost)) {
    throw new Error("Variavel de ambiente invalida: " + nome);
  }

  return url.toString();
}

function validarEmailOpcional(valor, nome) {
  if (!valor) {
    return "";
  }
  if (valor.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor)) {
    throw new Error("Variavel de ambiente invalida: " + nome);
  }
  return valor.toLowerCase();
}

function validarWebhookGoogleDrive(valor) {
  if (!valor) {
    return "";
  }
  let url;
  try {
    url = new URL(valor);
  } catch (erro) {
    throw new Error("Variavel de ambiente invalida: GOOGLE_DRIVE_WEBHOOK_URL");
  }
  if (url.protocol !== "https:"
      || url.search
      || url.hash
      || url.pathname !== "/api/integracoes/google-drive/webhook") {
    throw new Error("Variavel de ambiente invalida: GOOGLE_DRIVE_WEBHOOK_URL");
  }
  return url.toString();
}

function lerOrigensCors(variaveis) {
  const textoDasOrigens = exigirTexto(variaveis, "CORS_ORIGENS");
  const origens = textoDasOrigens.split(",").map(function limparOrigem(origem) {
    return origem.trim();
  }).filter(function removerOrigemVazia(origem) {
    return origem !== "";
  });

  if (origens.includes("*")) {
    throw new Error("CORS_ORIGENS nao pode liberar todas as origens");
  }

  return origens;
}

function validarVariaveisDeAmbiente(variaveis) {
  const ambiente = variaveis.NODE_ENV || "development";
  const ambientesPermitidos = ["development", "test", "production"];

  if (!ambientesPermitidos.includes(ambiente)) {
    throw new Error("Variavel de ambiente invalida: NODE_ENV");
  }

  return Object.freeze({
    ambiente: ambiente,
    porta: lerInteiro(variaveis, "PORT", 3000, 1, 65535),
    nivelDeLog: variaveis.LOG_LEVEL || "info",
    origensCors: lerOrigensCors(variaveis),
    frontendUrl: exigirTexto(variaveis, "FRONTEND_URL").replace(/\/$/, ""),
    confiarProxy: lerInteiro(variaveis, "TRUST_PROXY", 0, 0, 10),
    seguranca: Object.freeze({
      csrfSecret: exigirSegredo(variaveis, "CSRF_SECRET"),
      duracaoSessaoHoras: lerInteiro(
        variaveis,
        "SESSION_DURATION_HOURS",
        168,
        1,
        720
      ),
      duracaoRecuperacaoMinutos: lerInteiro(
        variaveis,
        "PASSWORD_RESET_DURATION_MINUTES",
        30,
        5,
        1440
      ),
      nomeCookieSessao: exigirTexto(variaveis, "SESSION_COOKIE_NAME"),
      nomeCookieCsrf: exigirTexto(variaveis, "CSRF_COOKIE_NAME"),
      janelaRateLimitMinutos: lerInteiro(
        variaveis,
        "RATE_LIMIT_WINDOW_MINUTES",
        15,
        1,
        1440
      ),
      limiteAutenticacao: lerInteiro(
        variaveis,
        "AUTH_RATE_LIMIT_MAX",
        10,
        1,
        1000
      ),
      limiteRecuperacao: lerInteiro(
        variaveis,
        "RECOVERY_RATE_LIMIT_MAX",
        5,
        1,
        1000
      ),
      limiteSuporte: lerInteiro(variaveis, "SUPPORT_RATE_LIMIT_MAX", 5, 1, 100),
      limiteUpload: lerInteiro(variaveis, "UPLOAD_RATE_LIMIT_MAX", 20, 1, 1000),
      tamanhoMaximoPdfBytes: lerInteiro(variaveis, "UPLOAD_MAX_PDF_MB", 50, 1, 500) * 1024 * 1024,
      tamanhoMaximoVideoBytes: lerInteiro(variaveis, "UPLOAD_MAX_VIDEO_MB", 500, 1, 5000) * 1024 * 1024
    }),
    banco: Object.freeze({
      host: exigirTexto(variaveis, "DB_HOST"),
      porta: lerInteiro(variaveis, "DB_PORT", 3306, 1, 65535),
      usuario: exigirTexto(variaveis, "DB_USER"),
      senha: variaveis.DB_PASSWORD || "",
      nome: validarNomeDoBanco(exigirTexto(variaveis, "DB_NAME")),
      limiteDeConexoes: lerInteiro(variaveis, "DB_CONNECTION_LIMIT", 10, 1, 50)
    }),
    email: Object.freeze({
      host: lerTextoOpcional(variaveis, "SMTP_HOST"),
      porta: lerInteiro(variaveis, "SMTP_PORT", 465, 1, 65535),
      seguro: lerBooleano(variaveis, "SMTP_SECURE", true),
      usuario: lerTextoOpcional(variaveis, "SMTP_USER"),
      senha: variaveis.SMTP_PASSWORD || "",
      remetente: lerTextoOpcional(variaveis, "SMTP_FROM")
    }),
    suporte: Object.freeze({
      destinatario: validarEmailOpcional(
        lerTextoOpcional(variaveis, "SUPPORT_EMAIL_TO"),
        "SUPPORT_EMAIL_TO"
      )
    }),
    analytics: Object.freeze({
      retencaoEventosDias: lerInteiro(
        variaveis,
        "ANALYTICS_RAW_RETENTION_DAYS",
        180,
        90,
        3650
      ),
      loteRetencao: lerInteiro(
        variaveis,
        "ANALYTICS_RETENTION_BATCH_SIZE",
        5000,
        100,
        50000
      )
    }),
    googleDrive: Object.freeze({
      clientId: lerTextoOpcional(variaveis, "GOOGLE_DRIVE_CLIENT_ID"),
      clientSecret: lerTextoOpcional(variaveis, "GOOGLE_DRIVE_CLIENT_SECRET"),
      pastaRaizId: lerTextoOpcional(variaveis, "GOOGLE_DRIVE_PASTA_RAIZ_ID"),
      redirectUri: validarUrlOpcional(
        lerTextoOpcional(variaveis, "GOOGLE_DRIVE_REDIRECT_URI"),
        "GOOGLE_DRIVE_REDIRECT_URI",
        ambiente
      ),
      refreshToken: lerTextoOpcional(variaveis, "GOOGLE_DRIVE_REFRESH_TOKEN"),
      webhookUrl: validarWebhookGoogleDrive(
        lerTextoOpcional(variaveis, "GOOGLE_DRIVE_WEBHOOK_URL")
      ),
      intervaloChangesMs: lerInteiro(
        variaveis,
        "GOOGLE_DRIVE_CHANGES_INTERVAL_MS",
        60000,
        15000,
        3600000
      ),
      escopo: "https://www.googleapis.com/auth/drive"
    })
  });
}

function obterConfiguracao() {
  carregarArquivoDeAmbiente();
  return validarVariaveisDeAmbiente(process.env);
}

module.exports = {
  obterConfiguracao: obterConfiguracao,
  validarVariaveisDeAmbiente: validarVariaveisDeAmbiente
};

