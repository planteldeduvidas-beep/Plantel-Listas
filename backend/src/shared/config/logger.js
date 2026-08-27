const pino = require("pino");

function criarLogger(configuracao, destino) {
  const opcoes = {
    level: configuracao.nivelDeLog,
    base: undefined,
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.headers.x-csrf-token",
        "req.headers.x-goog-channel-token",
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
