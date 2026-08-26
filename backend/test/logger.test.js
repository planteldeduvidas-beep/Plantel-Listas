const test = require("node:test");
const assert = require("node:assert/strict");
const { PassThrough } = require("node:stream");
const pinoHttp = require("pino-http");
const criarLogger = require("../src/shared/config/logger");

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
      cookie: "sessao=segredo-do-cookie"
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
  assert.equal(conteudo.includes("[REMOVIDO]"), true);
});

