const express = require("express");
const impedirCachePrivado = require("../../shared/middlewares/impedirCachePrivado");
const { protegerContraCsrf } = require("../../shared/middlewares/protegerCsrf");

function criarPermissaoRoutes(dependencias) {
  const router = express.Router();

  router.use(impedirCachePrivado);
  router.use(dependencias.autenticar);
  router.get("/minhas", dependencias.controller.listarMinhas);
  router.get("/", dependencias.autorizarAdmin, dependencias.controller.listarTodas);
  router.post(
    "/",
    dependencias.autorizarAdmin,
    protegerContraCsrf,
    dependencias.controller.conceder
  );
  router.delete(
    "/:id",
    dependencias.autorizarAdmin,
    protegerContraCsrf,
    dependencias.controller.revogar
  );
  return router;
}

module.exports = criarPermissaoRoutes;
