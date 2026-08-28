const express = require("express");
const impedirCachePrivado = require("../../shared/middlewares/impedirCachePrivado");

function criarAuditoriaRoutes(dependencias) {
  const router = express.Router();
  router.use(impedirCachePrivado, dependencias.autenticar, dependencias.autorizarAdmin);
  router.get("/", dependencias.controller.consultar);
  return router;
}
module.exports = criarAuditoriaRoutes;
