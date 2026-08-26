const express = require("express");
const impedirCachePrivado = require("../../shared/middlewares/impedirCachePrivado");
const { protegerContraCsrf } = require("../../shared/middlewares/protegerCsrf");

function criarUsuarioRoutes(dependencias) {
  const router = express.Router();
  const controller = dependencias.controller;
  const autenticar = dependencias.autenticar;
  const autorizarAdmin = dependencias.autorizarAdmin;

  router.use(impedirCachePrivado);
  router.use(autenticar);
  router.use(autorizarAdmin);
  router.get("/", controller.listar);
  router.patch(
    "/:usuarioId/ativo",
    protegerContraCsrf,
    controller.alterarAtivo
  );
  router.patch(
    "/:usuarioId/papel",
    protegerContraCsrf,
    controller.alterarPapel
  );

  return router;
}

module.exports = criarUsuarioRoutes;

