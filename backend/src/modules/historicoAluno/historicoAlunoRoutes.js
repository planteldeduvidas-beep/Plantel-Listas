const express = require("express");
const impedirCachePrivado = require("../../shared/middlewares/impedirCachePrivado");

function criarHistoricoAlunoRoutes(dependencias) {
  const router = express.Router();
  router.use(impedirCachePrivado, dependencias.autenticar, dependencias.autorizarAluno);
  router.get("/", dependencias.controller.listar);
  return router;
}

module.exports = criarHistoricoAlunoRoutes;
