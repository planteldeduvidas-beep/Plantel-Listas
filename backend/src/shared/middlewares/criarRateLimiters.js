const { rateLimit } = require("express-rate-limit");

function criarHandlerRateLimit(codigo) {
  return function responderLimiteExcedido(req, res) {
    res.status(429).json({
      erro: {
        codigo: codigo,
        mensagem: "Muitas tentativas. Aguarde antes de tentar novamente."
      }
    });
  };
}

function criarLimitador(janelaMs, limite, codigo) {
  return rateLimit({
    windowMs: janelaMs,
    limit: limite,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: criarHandlerRateLimit(codigo)
  });
}

function criarRateLimiters(configuracao) {
  const janelaMs = configuracao.seguranca.janelaRateLimitMinutos * 60 * 1000;

  return {
    autenticacao: criarLimitador(
      janelaMs,
      configuracao.seguranca.limiteAutenticacao,
      "LIMITE_AUTENTICACAO"
    ),
    recuperacao: criarLimitador(
      janelaMs,
      configuracao.seguranca.limiteRecuperacao,
      "LIMITE_RECUPERACAO"
    )
  };
}

module.exports = criarRateLimiters;

