const pino = require("pino");

function serializarErroSeguro(erro) {
  // Mensagem, cause, SQL e config de providers podem conter credenciais/dados.
  // Preservar apenas metadados tecnicos e localizacoes, nunca o objeto original.
  const tipos = ["Error", "TypeError", "RangeError", "SyntaxError", "AppError"];
  const codigo = String(erro && (erro.codigo || erro.code) || "ERRO_INTERNO");
  const locais = String(erro && erro.stack || "").split("\n").slice(1)
    .filter(linha => /^\s+at\s/.test(linha))
    .map(linha => linha.match(/([A-Za-z0-9_.-]+\.(?:js|cjs|mjs):\d+:\d+)\)?$/)?.[1])
    .filter(Boolean).slice(0, 8);
  return {
    type: tipos.includes(erro && erro.name) ? erro.name : "Error",
    codigo: /^[A-Z0-9_]{1,100}$/.test(codigo) ? codigo : "ERRO_INTERNO",
    locais
  };
}

function criarLogger(configuracao, destino) {
  const opcoes = {
    level: configuracao.nivelDeLog,
    base: undefined,
    serializers: { err: serializarErroSeguro },
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.headers.x-csrf-token",
        "req.headers.x-goog-channel-token",
        "req.headers.referer",
        "res.headers.set-cookie",
        "senha",
        "token",
        "secret",
        "refreshToken"
      ],
      censor: "[REMOVIDO]"
    }
  };

  return destino ? pino(opcoes, destino) : pino(opcoes);
}

module.exports = criarLogger;
module.exports.serializarErroSeguro = serializarErroSeguro;
