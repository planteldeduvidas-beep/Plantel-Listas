const crypto = require("node:crypto");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

function criarHandlerRateLimit(codigo) {
  return async function responderLimiteExcedido(req, res) {
    await req.app.locals.defesaAtiva?.registrar(req, "RATE_LIMIT_TRIGGERED");
    res.status(429).json({
      erro: {
        codigo: codigo,
        mensagem: "Muitas tentativas. Aguarde antes de tentar novamente."
      }
    });
  };
}

function criarLimitador(janelaMs, limite, codigo, opcoes = {}) {
  return rateLimit({
    windowMs: janelaMs,
    limit: limite,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: criarHandlerRateLimit(codigo),
    ...opcoes
  });
}

function chaveUsuario(req) {
  return "usuario:" + String(req.usuario.id);
}

function chaveLogin(req) {
  const ip = ipKeyGenerator(req.ip);
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase().slice(0, 254) : "";
  const identificador = crypto.createHash("sha256").update(email).digest("hex");
  return ip + ":" + identificador;
}

function criarRateLimiters(configuracao) {
  const janelaMs = configuracao.seguranca.janelaRateLimitMinutos * 60 * 1000;

  return {
    autenticacao: criarLimitador(
      janelaMs,
      configuracao.seguranca.limiteAutenticacaoPorIp || 120,
      "LIMITE_AUTENTICACAO",
      { skipSuccessfulRequests: true }
    ),
    loginPorConta: criarLimitador(janelaMs, configuracao.seguranca.limiteAutenticacao,
      "LIMITE_AUTENTICACAO", { keyGenerator: chaveLogin, skipSuccessfulRequests: true }),
    cadastro: criarLimitador(janelaMs, configuracao.seguranca.limiteCadastro || 60,
      "LIMITE_CADASTRO"),
    recuperacao: criarLimitador(
      janelaMs,
      configuracao.seguranca.limiteRecuperacao,
      "LIMITE_RECUPERACAO"
    ),
    suporte: criarLimitador(
      janelaMs,
      configuracao.seguranca.limiteSuporte,
      "LIMITE_SUPORTE",
      { keyGenerator: chaveUsuario }
    ),
    suportePublico: criarLimitador(janelaMs, 5, "LIMITE_SUPORTE"),
    emailConta: criarLimitador(janelaMs, 10, "LIMITE_EMAIL_CONTA", { keyGenerator: chaveUsuario }),
    upload: criarLimitador(janelaMs, configuracao.seguranca.limiteUpload,
      "LIMITE_UPLOAD", { keyGenerator: chaveUsuario }),
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

