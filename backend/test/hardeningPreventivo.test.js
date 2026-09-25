const test = require("node:test");
const assert = require("node:assert/strict");
const { PassThrough } = require("node:stream");
const express = require("express");
const request = require("supertest");
const criarLogger = require("../src/shared/config/logger");
const criarAplicacao = require("../src/app");
const criarRotas = require("../src/modules/materiais/gestaoMateriaisRoutes");
const { validarConsulta, validarMaterialId } = require("../src/modules/materiais/acervoValidator");
const { inteiroPositivo } = require("../src/modules/materiais/gestaoMateriaisValidator");
const { emitirTokenCsrf } = require("../src/shared/middlewares/protegerCsrf");
const cookieParser = require("cookie-parser");
const configuracao = {
  ambiente: "test", nivelDeLog: "info", origensCors: ["http://localhost:5173"],
  googleDrive: {}, suporte: {},
  seguranca: { csrfSecret: "segredo-ficticio-para-teste-de-hardening", nomeCookieCsrf: "csrf_teste",
    tamanhoMaximoPdfBytes: 1024, tamanhoMaximoVideoBytes: 2048 }
};

test("logs conservam codigo/localizacao sem payload, SQL, mensagem ou causa sensivel", () => {
  const destino = new PassThrough();
  let log = "";
  destino.on("data", parte => { log += parte; });
  const logger = criarLogger(configuracao, destino);
  const erro = Object.assign(new Error("SENTINELA_MENSAGEM"), {
    code: "ER_PARSE_ERROR", sql: "SENTINELA_SQL", body: "SENTINELA_BODY",
    config: { data: "SENTINELA_OAUTH" }, cause: new Error("SENTINELA_CAUSA")
  });
  logger.error({ err: erro }, "Falha controlada");
  assert.equal(log.includes("SENTINELA_"), false);
  assert.ok(log.includes("ER_PARSE_ERROR"));
  assert.ok(log.includes("hardeningPreventivo.test.js:"));
});

test("Referer com token nao aparece no log HTTP", async () => {
  const destino = new PassThrough();
  let log = "";
  destino.on("data", parte => { log += parte; });
  const app = criarAplicacao(configuracao, criarLogger(configuracao, destino));
  await request(app).get("/api/saude").set("Referer", "https://example.com/?token=SENTINELA_RESET");
  assert.equal(log.includes("SENTINELA_RESET"), false);
});

test("erro de dependencia no logger HTTP nao expoe SQL nem credenciais", async () => {
  const destino = new PassThrough();
  let log = "";
  destino.on("data", parte => { log += parte; });
  const app = criarAplicacao({ ...configuracao, seguranca: { ...configuracao.seguranca,
    nomeCookieSessao: "sessao", janelaRateLimitMinutos: 15, limiteAutenticacao: 10,
    limiteRecuperacao: 5, limiteSuporte: 5, limiteUpload: 20 } }, criarLogger(configuracao, destino), {
    pool: { execute: async () => { throw Object.assign(new Error("SENTINELA_DRIVER"), { sql: "SENTINELA_SQL" }); } }
  });
  const resposta = await request(app).get("/api/autenticacao/me").set("Cookie", "sessao=token-ficticio");
  assert.equal(resposta.status, 500);
  assert.equal(log.includes("SENTINELA_"), false);
});

test("JSON malformado e corpo excessivo retornam 400/413 sem ecoar dados", async () => {
  const app = criarAplicacao(configuracao, criarLogger({ nivelDeLog: "silent" }));
  const invalido = await request(app).post("/api/qualquer").type("json").send('{"senha":"SENTINELA_JSON"');
  assert.equal(invalido.status, 400);
  assert.equal(JSON.stringify(invalido.body).includes("SENTINELA"), false);
  const grande = await request(app).post("/api/qualquer").send({ senha: "x".repeat(110000) });
  assert.equal(grande.status, 413);
  assert.equal(grande.body.erro.stack, undefined);
});

test("ordenacao rejeita propriedades herdadas e IDs rejeitam perda de precisao", () => {
  for (const ordenar of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
    assert.throws(() => validarConsulta({ ordenar }), erro => erro.statusCode === 400);
  }
  for (const id of ["9007199254740993", "9".repeat(400)]) {
    assert.throws(() => validarMaterialId(id), erro => erro.statusCode === 400);
    assert.throws(() => inteiroPositivo(id, "Material"), erro => erro.statusCode === 400);
  }
  for (const ordenar of ["nome_asc", "nome_desc", "recente"]) assert.equal(validarConsulta({ ordenar }).ordenar, ordenar);
  assert.equal(validarMaterialId("42"), 42);
});

test("aluno e papel desconhecido sao barrados antes de interpretar multipart; gestores continuam", async () => {
  for (const papel of ["aluno", "desconhecido", "professor", "admin"]) {
    const app = express();
    app.locals.configuracao = configuracao;
    app.use(cookieParser());
    app.get("/csrf", emitirTokenCsrf);
    const controller = new Proxy({}, { get: () => (req, res) => res.sendStatus(204) });
    app.use("/gestao", criarRotas({ configuracao, controller,
      autenticar: (req, res, next) => { req.usuario = { id: 1, papel }; next(); },
      autorizarAdmin: (req, res, next) => next(), rateLimiter: (req, res, next) => next()
    }));
    app.use((erro, req, res, next) => res.status(erro.statusCode || 500).json({ codigo: erro.codigo }));
    const agente = request.agent(app);
    const csrf = (await agente.get("/csrf")).body.csrfToken;
    // Sem boundary: se multer for executado, responde 400, nao 403.
    const resposta = await agente.post("/gestao").set("X-CSRF-Token", csrf)
      .set("Content-Type", "multipart/form-data").send("nao-processar");
    assert.equal(resposta.status, ["professor", "admin"].includes(papel) ? 400 : 403);
    assert.equal((await agente.get("/gestao/pastas")).status, ["professor", "admin"].includes(papel) ? 204 : 403);
  }
});

test("consultas caras limitam por usuario sem afetar outro aluno ou streaming", async () => {
  const criarLimitadores = require("../src/shared/middlewares/criarRateLimiters");
  const criarAcervoRoutes = require("../src/modules/materiais/acervoRoutes");
  const app = express();
  let consultas = 0;
  const controller = new Proxy({}, { get: (alvo, nome) => (req, res) => {
    if (nome === "consultar") consultas++;
    res.sendStatus(204);
  } });
  const limitadores = criarLimitadores({ seguranca: { janelaRateLimitMinutos: 15, limiteConsultaAcervo: 2 } });
  app.use(criarAcervoRoutes({ controller, rateLimiterConsulta: limitadores.consultaAcervo,
    autenticar: (req, res, next) => { req.usuario = { id: req.headers["x-usuario-fixture"] || "1" }; next(); },
    autorizarAdmin: (req, res, next) => next()
  }));
  assert.equal((await request(app).get("/")).status, 204);
  assert.equal((await request(app).get("/")).status, 204);
  const bloqueado = await request(app).get("/");
  assert.equal(bloqueado.status, 429);
  assert.equal(bloqueado.body.erro.codigo, "LIMITE_CONSULTA_ACERVO");
  assert.equal(consultas, 2);
  assert.equal((await request(app).get("/").set("X-Usuario-Fixture", "2")).status, 204);
  assert.equal((await request(app).get("/materiais/1/conteudo").set("Range", "bytes=0-9")).status, 204);
  assert.equal((await request(app).get("/materiais/1/download")).status, 204);
});
