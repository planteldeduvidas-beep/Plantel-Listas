const crypto = require("node:crypto");
const AppError = require("../errors/AppError");
const { gerarTokenAleatorio } = require("../utils/tokens");
const { definirCookieCsrf } = require("../utils/cookies");

function assinarNonce(nonce, segredo) {
  return crypto.createHmac("sha256", segredo).update(nonce, "utf8").digest("base64url");
}

function gerarTokenCsrf(segredo) {
  const nonce = gerarTokenAleatorio();
  return nonce + "." + assinarNonce(nonce, segredo);
}

function compararTextosComTempoConstante(textoA, textoB) {
  if (typeof textoA !== "string" || typeof textoB !== "string") {
    return false;
  }

  const bufferA = Buffer.from(textoA, "utf8");
  const bufferB = Buffer.from(textoB, "utf8");

  if (bufferA.length !== bufferB.length) {
    return false;
  }

  return crypto.timingSafeEqual(bufferA, bufferB);
}

function validarAssinaturaDoToken(token, segredo) {
  if (typeof token !== "string") {
    return false;
  }

  const partes = token.split(".");
  if (partes.length !== 2 || !partes[0] || !partes[1]) {
    return false;
  }

  const assinaturaEsperada = assinarNonce(partes[0], segredo);
  return compararTextosComTempoConstante(partes[1], assinaturaEsperada);
}

function emitirTokenCsrf(req, res) {
  const configuracao = req.app.locals.configuracao;
  const token = gerarTokenCsrf(configuracao.seguranca.csrfSecret);
  definirCookieCsrf(res, token, configuracao);
  res.status(200).json({ csrfToken: token });
}

function protegerContraCsrf(req, res, next) {
  const configuracao = req.app.locals.configuracao;
  const tokenDoCookie = req.cookies[configuracao.seguranca.nomeCookieCsrf];
  const tokenDoHeader = req.get("X-CSRF-Token");
  const tokenValido = compararTextosComTempoConstante(tokenDoCookie, tokenDoHeader)
    && validarAssinaturaDoToken(tokenDoHeader, configuracao.seguranca.csrfSecret);

  if (!tokenValido) {
    next(new AppError("Token CSRF invalido", 403, "CSRF_INVALIDO"));
    return;
  }

  next();
}

module.exports = {
  emitirTokenCsrf: emitirTokenCsrf,
  protegerContraCsrf: protegerContraCsrf,
  gerarTokenCsrf: gerarTokenCsrf,
  validarAssinaturaDoToken: validarAssinaturaDoToken
};

