const test = require("node:test");
const assert = require("node:assert/strict");
const pino = require("pino");
const request = require("supertest");
const criarAplicacao = require("../src/app");

function criarConfiguracao(ambiente) {
  return {
    ambiente: ambiente,
    origensCors: ["http://localhost:5173"]
  };
}

function criarApp(ambiente) {
  const logger = pino({ level: "silent" });
  return criarAplicacao(criarConfiguracao(ambiente), logger);
}

test("responde o endpoint de saude", async function testarSaude() {
  const resposta = await request(criarApp("test")).get("/api/saude");
  assert.equal(resposta.status, 200);
  assert.deepEqual(resposta.body, { status: "ok" });
  assert.equal(resposta.headers["x-powered-by"], undefined);
  assert.equal(resposta.headers["x-content-type-options"], "nosniff");
});

test("padroniza resposta 404", async function testarRotaNaoEncontrada() {
  const resposta = await request(criarApp("test")).get("/rota-inexistente");
  assert.equal(resposta.status, 404);
  assert.equal(resposta.body.erro.codigo, "ROTA_NAO_ENCONTRADA");
});

test("bloqueia origem CORS nao autorizada", async function testarCors() {
  const resposta = await request(criarApp("test"))
    .get("/api/saude")
    .set("Origin", "https://origem-invalida.example");
  assert.equal(resposta.status, 403);
  assert.equal(resposta.body.erro.codigo, "ORIGEM_NAO_PERMITIDA");
});

