const express = require("express");
const impedirCachePrivado = require("../../shared/middlewares/impedirCachePrivado");
const { protegerContraCsrf } = require("../../shared/middlewares/protegerCsrf");

function criarIntegracaoGoogleDriveRoutes(dependencias) {
  const router = express.Router();

  router.use(impedirCachePrivado);
  router.use(dependencias.autenticar);
  router.use(dependencias.autorizarAdmin);
  router.get("/status", dependencias.controller.obterStatus);
  router.post("/oauth/iniciar", protegerContraCsrf, dependencias.controller.iniciarOAuth);
  router.get("/oauth/callback", dependencias.controller.concluirOAuth);
  router.post("/sincronizar", protegerContraCsrf, dependencias.controller.sincronizar);

  return router;
}

module.exports = criarIntegracaoGoogleDriveRoutes;
