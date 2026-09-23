const express = require("express");
const multer = require("multer");
const AppError = require("../../shared/errors/AppError");
const impedirCachePrivado = require("../../shared/middlewares/impedirCachePrivado");
const { protegerContraCsrf } = require("../../shared/middlewares/protegerCsrf");

function criarParceiroRoutes({ controller, autenticar, autorizarAdmin, rateLimiter }) {
  const router = express.Router();
  const receber = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 512 * 1024, files: 1, fields: 0, parts: 1 }
  }).single("imagem");
  const receberImagem = (req, res, next) => receber(req, res, erro => {
    if (!erro) return next();
    next(new AppError(erro.code === "LIMIT_FILE_SIZE" ? "Imagem maior que 512 KB" : "Upload de imagem invalido",
      erro.code === "LIMIT_FILE_SIZE" ? 413 : 400, "IMAGEM_INVALIDA"));
  });

  router.use(impedirCachePrivado, autenticar);
  router.get("/", controller.listar);
  router.get("/admin", autorizarAdmin, controller.listarAdmin);
  router.get("/:id/imagem", controller.obterImagem);
  router.post("/", autorizarAdmin, protegerContraCsrf, controller.criar);
  router.patch("/:id", autorizarAdmin, protegerContraCsrf, controller.editar);
  router.post("/:id/imagem", autorizarAdmin, protegerContraCsrf, rateLimiter, receberImagem, controller.alterarImagem);
  router.delete("/:id/imagem", autorizarAdmin, protegerContraCsrf, controller.removerImagem);
  return router;
}

module.exports = criarParceiroRoutes;
