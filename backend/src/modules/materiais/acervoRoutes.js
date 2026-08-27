const express = require("express");
const impedirCachePrivado = require("../../shared/middlewares/impedirCachePrivado");
const { protegerContraCsrf } = require("../../shared/middlewares/protegerCsrf");

function criarAcervoRoutes(dependencias) {
  const router = express.Router();
  router.use(impedirCachePrivado);
  router.use(dependencias.autenticar);
  router.get("/", dependencias.controller.consultar);
  router.get("/organizacao", dependencias.autorizarAdmin, dependencias.controller.obterOrganizacao);
  router.get("/materiais/:materialId/conteudo", dependencias.controller.visualizar);
  router.get("/materiais/:materialId/download", dependencias.controller.baixar);
  router.patch(
    "/pastas/:categoriaId/classificacao",
    dependencias.autorizarAdmin,
    protegerContraCsrf,
    dependencias.controller.classificarPasta
  );
  router.patch(
    "/organizacao",
    dependencias.autorizarAdmin,
    protegerContraCsrf,
    dependencias.controller.classificarPastas
  );
  return router;
}

module.exports = criarAcervoRoutes;
