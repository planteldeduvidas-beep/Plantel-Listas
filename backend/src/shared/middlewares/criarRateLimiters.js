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
    ),
    suporte: criarLimitador(
      janelaMs,
      configuracao.seguranca.limiteSuporte,
      "LIMITE_SUPORTE"
    ),
    upload: criarLimitador(janelaMs, configuracao.seguranca.limiteUpload, "LIMITE_UPLOAD"),
    consultaAcervo: rateLimit({
      windowMs: 60000,
      limit: configuracao.seguranca.limiteConsultaAcervo || 120,
      // Executado somente depois da autenticacao; chave vem da sessao no banco.
      keyGenerator: req => String(req.usuario.id),
      standardHeaders: "draft-8",
      legacyHeaders: false,
      handler: criarHandlerRateLimit("LIMITE_CONSULTA_ACERVO")
    })
  };
}

module.exports = criarRateLimiters;

