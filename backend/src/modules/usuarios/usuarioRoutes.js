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
  router.post("/", protegerContraCsrf, controller.criar);
  router.patch("/:usuarioId", protegerContraCsrf, controller.editar);
  router.patch(
    "/:usuarioId/ativo",
    protegerContraCsrf,
    controller.alterarAtivo
  );
  router.post("/:usuarioId/redefinicao-senha", protegerContraCsrf, controller.iniciarRedefinicao);
  router.patch(
    "/:usuarioId/papel",
    protegerContraCsrf,
    controller.alterarPapel
  );

  return router;
}

module.exports = criarUsuarioRoutes;

