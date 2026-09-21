const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
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

test("producao entrega o fallback da SPA nas rotas institucionais sem mascarar a API", async function testarFallbackSpa(t) {
  const diretorio = fs.mkdtempSync(path.join(os.tmpdir(), "plantel-spa-"));
  fs.writeFileSync(path.join(diretorio, "index.html"), "<!doctype html><title>Plantel Listas</title>");
  t.after(function limpar() { fs.rmSync(diretorio, { recursive: true, force: true }); });
  const app = criarAplicacao(
    criarConfiguracao("production"),
    pino({ level: "silent" }),
    { caminhoDoFrontend: diretorio }
  );

  for (const rota of ["/privacidade", "/termos"]) {
    const resposta = await request(app).get(rota).set("Accept", "text/html");
    assert.equal(resposta.status, 200);
    assert.match(resposta.text, /Plantel Listas/);
  }

  const apiInexistente = await request(app).get("/api/inexistente").set("Accept", "text/html");
  assert.equal(apiInexistente.status, 404);
  assert.equal(apiInexistente.body.erro.codigo, "ROTA_NAO_ENCONTRADA");
});

