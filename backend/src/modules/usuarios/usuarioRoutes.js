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
  router.post("/solicitar-confirmacao-email", dependencias.rateLimiters.emailConta, protegerContraCsrf, controller.solicitarConfirmacaoEmLote);
  router.get("/:usuarioId", controller.detalhes);
  router.get('/:usuarioId/faixa-etaria', controller.obterFaixaEtaria);
  router.post('/:usuarioId/faixa-etaria', dependencias.rateLimiters.emailConta, protegerContraCsrf, controller.corrigirFaixaEtaria);
  router.delete("/:usuarioId", protegerContraCsrf, controller.excluir);
  router.post("/:usuarioId/verificacao-email", dependencias.rateLimiters.emailConta, protegerContraCsrf, controller.verificar);
  router.post("/:usuarioId/regularizacao-email", protegerContraCsrf, controller.regularizar);
  router.post("/", protegerContraCsrf, controller.criar);
  router.patch("/:usuarioId", protegerContraCsrf, controller.editar);
  router.patch(
    "/:usuarioId/ativo",
    protegerContraCsrf,
    controller.alterarAtivo
  );
  router.post("/:usuarioId/redefinicao-senha", dependencias.rateLimiters.emailConta, protegerContraCsrf, controller.iniciarRedefinicao);
  router.patch(
    "/:usuarioId/papel",
    protegerContraCsrf,
    controller.alterarPapel
  );

  return router;
}

module.exports = criarUsuarioRoutes;

