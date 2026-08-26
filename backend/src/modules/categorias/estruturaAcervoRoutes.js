const express = require("express");
const impedirCachePrivado = require("../../shared/middlewares/impedirCachePrivado");
const { protegerContraCsrf } = require("../../shared/middlewares/protegerCsrf");

function criarRotasAdministrativas(controller, autenticar, autorizarAdmin) {
  const router = express.Router();

  router.use(impedirCachePrivado);
  router.use(autenticar);
  router.use(autorizarAdmin);
  router.get("/", controller.listar);
  router.post("/", protegerContraCsrf, controller.criar);
  router.patch("/:id", protegerContraCsrf, controller.editar);
  router.patch("/:id/ativo", protegerContraCsrf, controller.alterarAtivo);
  return router;
}

function criarEstruturaAcervoRoutes(dependencias) {
  const routerPublico = express.Router();

  routerPublico.use(impedirCachePrivado);
  routerPublico.get("/", dependencias.autenticar, dependencias.controller.listarPublica);

  return {
    publica: routerPublico,
    categorias: criarRotasAdministrativas(
      dependencias.controller.categorias,
      dependencias.autenticar,
      dependencias.autorizarAdmin
    ),
    disciplinas: criarRotasAdministrativas(
      dependencias.controller.disciplinas,
      dependencias.autenticar,
      dependencias.autorizarAdmin
    ),
    concursos: criarRotasAdministrativas(
      dependencias.controller.concursos,
      dependencias.autenticar,
      dependencias.autorizarAdmin
    )
  };
}

module.exports = criarEstruturaAcervoRoutes;
