const express = require("express");
const impedirCachePrivado = require("../../shared/middlewares/impedirCachePrivado");
const { protegerContraCsrf } = require("../../shared/middlewares/protegerCsrf");

function criarGoogleDriveChangesRoutes(dependencias) {
  const publico = express.Router();
  publico.post("/webhook", dependencias.controller.webhook);

  const administrativo = express.Router();
  administrativo.use(impedirCachePrivado);
  administrativo.use(dependencias.autenticar);
  administrativo.use(dependencias.autorizarAdmin);
  administrativo.get("/changes/status", dependencias.controller.status);
  administrativo.post("/changes/renovar", protegerContraCsrf, dependencias.controller.renovar);
  return { publico: publico, administrativo: administrativo };
}

module.exports = criarGoogleDriveChangesRoutes;
