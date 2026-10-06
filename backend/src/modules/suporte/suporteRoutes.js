const express = require("express");
const impedirCachePrivado = require("../../shared/middlewares/impedirCachePrivado");
const { protegerContraCsrf } = require("../../shared/middlewares/protegerCsrf");

function criarSuporteRoutes(dependencias) {
  const router = express.Router();
  router.use(impedirCachePrivado);
  router.post("/conta", protegerContraCsrf, dependencias.rateLimiterPublico, dependencias.controller.ajudaConta);
  router.use(dependencias.autenticar);
  router.post(
    "/",
    dependencias.autorizarAlunoOuProfessor,
    protegerContraCsrf,
    dependencias.rateLimiter,
    dependencias.controller.enviar
  );
  return router;
}

module.exports = criarSuporteRoutes;
