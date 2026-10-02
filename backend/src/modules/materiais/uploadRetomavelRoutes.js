const express = require("express");
const {rateLimit} = require("express-rate-limit");
const {protegerContraCsrf} = require("../../shared/middlewares/protegerCsrf");
const impedirCachePrivado = require("../../shared/middlewares/impedirCachePrivado");
const AppError = require("../../shared/errors/AppError");
const {CHUNK_BYTES} = require("./uploadRetomavelService");

module.exports = function criarUploadRetomavelRoutes({service,autenticar,limitarInicio}) {
  const router = express.Router();
  const ativos = new Set();
  const acao = fn => (req,res,next) => Promise.resolve().then(() => fn(req,res)).catch(next);
  router.use(impedirCachePrivado,autenticar,(req,res,next) => {
    if (!["professor","admin"].includes(req.usuario.papel)) return next(new AppError("Usuario sem permissao",403,"SEM_PERMISSAO"));
    next();
  });
  router.use(rateLimit({windowMs:60000,limit:300,keyGenerator:req => "upload:" + req.usuario.id,
    standardHeaders:true,legacyHeaders:false,handler:(req,res) => res.status(429).json({erro:{codigo:"UPLOAD_LIMITE_REQUISICOES",mensagem:"Aguarde um minuto para retomar o envio."}})}));
  router.post("/",protegerContraCsrf,limitarInicio,acao(async(req,res) => res.status(201).json(await service.iniciar(req.usuario,req.body))));
  router.get("/:id",acao(async(req,res) => res.json(await service.consultar(req.usuario,req.params.id))));
  router.put("/:id/partes",protegerContraCsrf,acao(async(req,res) => {
    // Autorizacao da pasta/sessao antes de ler o corpo binario.
    await service.autorizarParte(req.usuario,req.params.id);
    if (ativos.size >= 4 || ativos.has(req.usuario.id)) throw new AppError("Outro envio esta em andamento. Aguarde para retomar.",429,"UPLOAD_OCUPADO");
    const tamanho = Number(req.headers["content-length"]);
    if (!Number.isSafeInteger(tamanho) || tamanho < 1 || tamanho > CHUNK_BYTES || !req.is("application/octet-stream")) throw new AppError("Parte de envio invalida",413,"UPLOAD_CHUNK_INVALIDO");
    const offsetTexto = req.headers["x-upload-offset"];
    if (!/^\d+$/.test(offsetTexto || "")) throw new AppError("Progresso invalido",400,"UPLOAD_CHUNK_INVALIDO");
    ativos.add(req.usuario.id);
    const liberar = () => ativos.delete(req.usuario.id);
    try {
      await new Promise((resolve,reject) => {
        const prazo = setTimeout(() => req.destroy(),30000);
        prazo.unref?.();
        express.raw({type:"application/octet-stream",limit:CHUNK_BYTES,inflate:false})(req,res,e => {
          clearTimeout(prazo);
          if (e) reject(new AppError("Esta parte do envio foi interrompida ou e invalida. Retome o envio.",400,"UPLOAD_CHUNK_INTERROMPIDO"));
          else resolve();
        });
      });
      res.json(await service.parte(req.usuario,req.params.id,Number(offsetTexto),req.body));
    } finally { req.body = null; liberar(); }
  }));
  router.post("/:id/finalizar",protegerContraCsrf,acao(async(req,res) => res.json(await service.finalizar(req.usuario,req.params.id))));
  router.delete("/:id",protegerContraCsrf,acao(async(req,res) => res.json(await service.cancelar(req.usuario,req.params.id))));
  return router;
};
