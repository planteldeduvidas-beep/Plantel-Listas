const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");
const fs = require("node:fs");
const criarUpload = require("../src/modules/materiais/uploadMaterialMiddleware");

function appUpload() {
  const app = express();
  app.post("/upload",criarUpload({seguranca:{tamanhoMaximoPdfBytes:1000,tamanhoMaximoVideoBytes:1000}}),async(req,res,next)=>{
    try { const conteudo=await fs.promises.readFile(req.file.path); await fs.promises.unlink(req.file.path); res.json({bytes:conteudo.length}); } catch(erro){next(erro);}
  });
  app.use((erro,req,res,next)=>res.status(erro.statusCode||500).json({codigo:erro.codigo}));
  return app;
}

test("upload prepara diretorio temporario por envio e distingue falha do servidor",async(t)=>{
  const app=appUpload();
  const mkdirOriginal=fs.mkdir;
  let chamadas=0;
  const mock=t.mock.method(fs,"mkdir",function(...args){chamadas++;return mkdirOriginal.apply(fs,args);});
  const enviar=()=>request(app).post("/upload").attach("arquivo",Buffer.from("%PDF-1.7\nconteudo"),"teste.pdf");
  assert.equal((await enviar()).status,200);
  assert.equal((await enviar()).status,200);
  assert.equal(chamadas,2);
  mock.mock.mockImplementation(function(diretorio,opcoes,callback){callback(Object.assign(new Error("caminho privado"),{code:"ENOSPC"}));});
  const falha=await enviar();
  assert.equal(falha.status,503);
  assert.equal(falha.body.codigo,"UPLOAD_ARMAZENAMENTO_INDISPONIVEL");
  assert.equal(falha.text.includes("caminho privado"),false);
});

test("multipart invalido e arquivo excedente continuam recusados",async()=>{
  const app=appUpload();
  const invalido=await request(app).post("/upload").set("Content-Type","multipart/form-data; boundary=teste").send("corpo truncado");
  assert.equal(invalido.status,400);
  const grande=await request(app).post("/upload").attach("arquivo",Buffer.alloc(1001),"grande.pdf");
  assert.equal(grande.status,413);
});
