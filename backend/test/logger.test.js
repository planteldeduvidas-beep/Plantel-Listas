const test = require("node:test");
const assert = require("node:assert/strict");
const { PassThrough } = require("node:stream");
const pinoHttp = require("pino-http");
const request = require("supertest");
const criarLogger = require("../src/shared/config/logger");
const criarAplicacao = require("../src/app");

test("remove cabecalhos sensiveis dos logs", function testarRedacaoDosLogs() {
  const destino = new PassThrough();
  let conteudo = "";
  destino.on("data", function acumularDados(parte) {
    conteudo += parte.toString("utf8");
  });

  const logger = criarLogger({ nivelDeLog: "info" }, destino);
  const middleware = pinoHttp({ logger: logger });
  const req = {
    method: "GET",
    url: "/api/saude",
    headers: {
      authorization: "Bearer segredo-que-nao-pode-vazar",
      cookie: "sessao=segredo-do-cookie",
      "x-csrf-token": "segredo-csrf"
    },
    socket: {}
  };
  const res = {
    getHeaders: function obterHeaders() {
      return {};
    },
    on: function registrarEvento() {},
    once: function registrarEventoUnico() {},
    emit: function emitirEvento() {}
  };

  middleware(req, res, function continuar() {});
  req.log.info("registro de teste");

  assert.equal(conteudo.includes("segredo-que-nao-pode-vazar"), false);
  assert.equal(conteudo.includes("segredo-do-cookie"), false);
  assert.equal(conteudo.includes("segredo-csrf"), false);
  assert.equal(conteudo.includes("[REMOVIDO]"), true);
});

test("nao registra senha enviada no corpo", async function testarCorpoForaDoLog() {
  const destino = new PassThrough();
  let conteudo = "";
  destino.on("data", function acumularDados(parte) {
    conteudo += parte.toString("utf8");
  });
  const configuracao = {
    ambiente: "test",
    nivelDeLog: "info",
    origensCors: ["http://localhost:5173"],
    confiarProxy: false
  };
  const logger = criarLogger(configuracao, destino);
  const app = criarAplicacao(configuracao, logger);
  await request(app)
    .post("/rota-inexistente")
    .send({ senha: "senha-do-corpo-que-nao-pode-vazar" });

  assert.equal(conteudo.includes("senha-do-corpo-que-nao-pode-vazar"), false);
});

test("remove codigo e estado OAuth da URL registrada", async function testarOAuthForaDoLog() {
  const destino = new PassThrough();
  let conteudo = "";
  destino.on("data", function acumularDados(parte) {
    conteudo += parte.toString("utf8");
  });
  const configuracao = {
    ambiente: "test",
    nivelDeLog: "info",
    origensCors: ["http://localhost:5173"],
    confiarProxy: false
  };
  const logger = criarLogger(configuracao, destino);
  const app = criarAplicacao(configuracao, logger);
  await request(app).get(
    "/api/integracoes/google-drive/oauth/callback?code=codigo-oauth-secreto&state=estado-oauth-secreto"
  );

  assert.equal(conteudo.includes("codigo-oauth-secreto"), false);
  assert.equal(conteudo.includes("estado-oauth-secreto"), false);
  assert.equal(conteudo.includes("/api/integracoes/google-drive/oauth/callback"), true);
});

