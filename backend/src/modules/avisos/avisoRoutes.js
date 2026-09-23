const express = require("express");
const impedirCachePrivado = require("../../shared/middlewares/impedirCachePrivado");
const { protegerContraCsrf } = require("../../shared/middlewares/protegerCsrf");

function criarAvisoRoutes({ controller, autenticar, autorizarAdmin }) {
  const router = express.Router();
  router.use(impedirCachePrivado, autenticar);
  router.get("/", controller.listar);
  router.get("/admin", autorizarAdmin, controller.listarAdmin);
  router.post("/", autorizarAdmin, protegerContraCsrf, controller.criar);
  router.patch("/:id", autorizarAdmin, protegerContraCsrf, controller.editar);
  return router;
}

module.exports = criarAvisoRoutes;
