const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");
const criarRoutes = require("../src/modules/materiais/uploadRetomavelRoutes");

test("rotas retomaveis exigem autenticacao/perfil antes de chamar service",async()=>{
  for(const papel of [null,"aluno"]){
    let chamou=false;const app=express();
    app.use("/api/uploads",criarRoutes({service:{consultar:()=>{chamou=true;}},limitarInicio:(q,s,n)=>n(),autenticar:(q,s,n)=>{
      if(!papel)return s.status(401).end();q.usuario={id:1,papel};n();
    }}));
    app.use((e,q,s,n)=>s.status(e.statusCode||500).json({codigo:e.codigo}));
    assert.equal((await request(app).get("/api/uploads/teste")).status,papel?403:401);
    assert.equal(chamou,false);
  }
});
