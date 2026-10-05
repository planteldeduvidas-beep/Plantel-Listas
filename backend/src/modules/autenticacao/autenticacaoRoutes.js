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
  router.post("/cadastro/email/solicitar", rateLimiters.recuperacao, protegerContraCsrf, controller.solicitarConfirmacaoCadastro);
  router.post("/cadastro/email/confirmar", rateLimiters.recuperacao, protegerContraCsrf, controller.confirmarCadastro);
  router.post(
    "/cadastro",
    rateLimiters.cadastro,
    protegerContraCsrf,
    controller.cadastrar
  );
  router.post(
    "/login",
    rateLimiters.autenticacao,
    rateLimiters.loginPorConta,
    protegerContraCsrf,
    controller.entrar
  );
  router.post("/logout", autenticar, protegerContraCsrf, controller.sair);
  router.get("/me", autenticar, controller.obterUsuarioAtual);
  router.post("/email/solicitar", autenticar, rateLimiters.emailConta, protegerContraCsrf, controller.solicitarConfirmacaoEmail);
  router.post("/email/confirmar", autenticar, rateLimiters.emailConta, protegerContraCsrf, controller.confirmarEmail);
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

