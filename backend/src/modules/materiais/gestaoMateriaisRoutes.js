const express=require("express");
const impedirCachePrivado=require("../../shared/middlewares/impedirCachePrivado");
const {protegerContraCsrf}=require("../../shared/middlewares/protegerCsrf");
const criarUpload=require("./uploadMaterialMiddleware");
const AppError=require("../../shared/errors/AppError");

function criarGestaoMateriaisRoutes(dependencias){
  const router=express.Router();
  const upload=criarUpload(dependencias.configuracao);
  router.use(impedirCachePrivado);
  router.use(dependencias.autenticar);
  router.use(function autorizarGestaoAntesDoUpload(req,res,next){
    if (!req.usuario || !["professor","admin"].includes(req.usuario.papel)) {
      return next(new AppError("Usuario sem permissao",403,"SEM_PERMISSAO"));
    }
    next();
  });
  router.get("/pastas",dependencias.controller.listarPastas);
  router.post("/pastas",protegerContraCsrf,dependencias.controller.criarPasta);
  router.post("/pastas/:categoriaId/vincular-drive",dependencias.autorizarAdmin,protegerContraCsrf,dependencias.controller.vincularPasta);
  router.patch("/pastas/:categoriaId/nome",protegerContraCsrf,dependencias.controller.renomearPasta);
  router.delete("/pastas/:categoriaId",dependencias.autorizarAdmin,protegerContraCsrf,dependencias.controller.excluirPasta);
  router.get("/solicitacoes-exclusao",dependencias.controller.listarSolicitacoesExclusao);
  router.post("/pastas/:categoriaId/solicitar-exclusao",protegerContraCsrf,dependencias.controller.solicitarExclusaoPasta);
  router.post("/solicitacoes-exclusao/:solicitacaoId/decidir",dependencias.autorizarAdmin,protegerContraCsrf,dependencias.controller.decidirExclusaoPasta);
  router.post("/",protegerContraCsrf,dependencias.rateLimiter,upload,dependencias.controller.adicionar);
  router.patch("/:materialId",protegerContraCsrf,dependencias.controller.editar);
  router.patch("/:materialId/mover",protegerContraCsrf,dependencias.controller.mover);
  router.post("/:materialId/substituir",protegerContraCsrf,dependencias.rateLimiter,upload,dependencias.controller.substituir);
  router.post("/:materialId/lixeira",protegerContraCsrf,dependencias.controller.enviarLixeira);
  router.get("/lixeira",dependencias.autorizarAdmin,dependencias.controller.listarLixeira);
  router.post("/:materialId/restaurar",dependencias.autorizarAdmin,protegerContraCsrf,dependencias.controller.restaurar);
  router.delete("/:materialId",dependencias.autorizarAdmin,protegerContraCsrf,dependencias.controller.excluir);
  return router;
}
module.exports=criarGestaoMateriaisRoutes;
