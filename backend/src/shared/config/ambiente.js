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
    banco: Object.freeze({
      host: exigirTexto(variaveis, "DB_HOST"),
      porta: lerInteiro(variaveis, "DB_PORT", 3306, 1, 65535),
      usuario: exigirTexto(variaveis, "DB_USER"),
      senha: variaveis.DB_PASSWORD || "",
      nome: validarNomeDoBanco(exigirTexto(variaveis, "DB_NAME")),
      limiteDeConexoes: lerInteiro(variaveis, "DB_CONNECTION_LIMIT", 10, 1, 50)
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

