const express = require("express");
const impedirCachePrivado = require("../../shared/middlewares/impedirCachePrivado");

function criarAnalyticsRoutes(dependencias) {
  const router = express.Router();
  router.use(impedirCachePrivado, dependencias.autenticar, dependencias.autorizarAdmin);
  router.get("/", dependencias.controller.painel);
  router.get("/relatorio.csv", dependencias.controller.relatorio);
  return router;
}
module.exports = criarAnalyticsRoutes;
