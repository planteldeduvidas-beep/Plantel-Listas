const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const cookieParser = require("cookie-parser");
const request = require("supertest");
const routes = require("../src/modules/suporte/suporteRoutes");
const service = require("../src/modules/suporte/suporteService");
const controller = require("../src/modules/suporte/suporteController");
const limiters = require("../src/shared/middlewares/criarRateLimiters");
const { gerarTokenCsrf } = require("../src/shared/middlewares/protegerCsrf");
const { criarEmailProviderFake } = require("../src/shared/providers/emailProvider");

test("suporte sem login protege envio, distingue identidade declarada e limita spam", async function () {
  const app=express();
  const configuracao={suporte:{destinatario:"equipe@example.com"},seguranca:{csrfSecret:"segredo-teste-publico",nomeCookieCsrf:"csrf",janelaRateLimitMinutos:15}};
  const emailProvider=criarEmailProviderFake();
  app.locals.configuracao=configuracao;
  app.use(express.json(),cookieParser());
  app.use("/suporte",routes({controller:controller(service({configuracao,emailProvider})),
    rateLimiterPublico:limiters(configuracao).suportePublico,
    autenticar:(req,res)=>res.sendStatus(401),autorizarAlunoOuProfessor:(req,res,next)=>next(),rateLimiter:(req,res,next)=>next()}));
  app.use((erro,req,res,next)=>res.status(erro.status||erro.statusCode||400).json({codigo:erro.codigo}));
  const csrf=gerarTokenCsrf(configuracao.seguranca.csrfSecret);
  const corpo={nome:"Pessoa Teste",emailConta:"email antigo errado",emailResposta:"contato@outlook.com",mensagem:"Estou com dificuldades para acessar."};
  const enviar=dados=>request(app).post("/suporte/conta").set("Cookie","csrf="+csrf).set("X-CSRF-Token",csrf).send(dados);
  assert.equal((await request(app).post("/suporte/conta").send(corpo)).body.codigo,"CSRF_INVALIDO");
  assert.equal((await enviar({...corpo,emailResposta:"a\r\nBcc:evil@example.com"})).status,400);
  assert.equal((await enviar({...corpo,papel:"admin"})).status,400);
  const sucesso=await enviar(corpo);
  assert.equal(sucesso.status,202); assert.match(sucesso.body.mensagem,/24 horas/);
  const mensagem=emailProvider.obterMensagens()[0];
  assert.equal(mensagem.destinatario,"equipe@example.com"); assert.equal(mensagem.email,corpo.emailResposta);
  assert.match(mensagem.papel,/nao verificada/); assert.match(mensagem.mensagem,/email antigo errado/);
  await enviar(corpo); await enviar(corpo);
  assert.equal((await enviar(corpo)).status,429);
  assert.equal((await request(app).post("/suporte").send({})).status,401);
});

test("ajuda publica preserva erro seguro de SMTP sem enviar resposta de sucesso", async function () {
  const s=service({configuracao:{suporte:{destinatario:"equipe@example.com"}},emailProvider:{enviarSuporte:async()=>{throw new Error("credencial SMTP secreta");}}});
  await assert.rejects(s.ajudaConta({nome:"Pessoa Teste",emailConta:"antiga@example.com",emailResposta:"contato@proton.me",mensagem:"Nao consigo acessar minha conta."}),erro=>erro.codigo==="SUPORTE_INDISPONIVEL" && !erro.message.includes("secreta"));
});
