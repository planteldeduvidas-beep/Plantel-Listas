const express = require("express");
const impedirCachePrivado = require("../../shared/middlewares/impedirCachePrivado");
const {
  emitirTokenCsrf,
  protegerContraCsrf
} = require("../../shared/middlewares/protegerCsrf");

function criarAutenticacaoRoutes(dependencias) {
  const router = express.Router();
  const controller = dependencias.controller;
  const autenticar = dependencias.autenticar;
  const rateLimiters = dependencias.rateLimiters;

  router.use(impedirCachePrivado);
  router.get("/csrf", emitirTokenCsrf);
  router.post(
    "/cadastro",
    rateLimiters.autenticacao,
    protegerContraCsrf,
    controller.cadastrar
  );
  router.post(
    "/login",
    rateLimiters.autenticacao,
    protegerContraCsrf,
    controller.entrar
  );
  router.post("/logout", autenticar, protegerContraCsrf, controller.sair);
  router.get("/me", autenticar, controller.obterUsuarioAtual);
  router.post(
    "/recuperacao-senha/solicitar",
    rateLimiters.recuperacao,
    protegerContraCsrf,
    controller.solicitarRecuperacao
  );
  router.post(
    "/recuperacao-senha/redefinir",
    rateLimiters.recuperacao,
    protegerContraCsrf,
    controller.redefinirSenha
  );

  return router;
}

module.exports = criarAutenticacaoRoutes;

