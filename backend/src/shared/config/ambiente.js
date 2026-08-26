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
      )
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

