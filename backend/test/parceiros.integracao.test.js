const test = require("node:test");
const assert = require("node:assert/strict");
const pino = require("pino");
const request = require("supertest");
const criarAplicacao = require("../src/app");
const { obterConfiguracao } = require("../src/shared/config/ambiente");
const { criarPool } = require("../src/shared/database/conexao");
const { criarHashDaSenha } = require("../src/modules/autenticacao/senha");

const base = obterConfiguracao();
const configuracao = { ...base, ambiente: "test", banco: { ...base.banco, nome: process.env.DB_TEST_NAME || base.banco.nome + "_test" } };
const pool = criarPool(configuracao.banco);
const aplicacao = criarAplicacao(configuracao, pino({ level: "silent" }), { pool });
const senha = "Senha-parceiros-teste-123";

async function entrar(email) {
  const agente = request.agent(aplicacao);
  const csrf = (await agente.get("/api/autenticacao/csrf")).body.csrfToken;
  assert.equal((await agente.post("/api/autenticacao/login").set("X-CSRF-Token", csrf).send({ email, senha })).status, 200);
  return { agente, csrf };
}

test("parceiros: CRUD admin, lista ativa e ordenada, upload seguro, CSRF e auditoria", async () => {
  const prefixo = "parceiros-teste-";
  try {
    for (const [nome, papel] of [["Admin Parceiros", "admin"], ["Aluno Parceiros", "aluno"], ["Professor Parceiros", "professor"]]) {
      await pool.execute("INSERT INTO usuarios (nome,email,senha_hash,papel) VALUES (?,?,?,?)",
        [nome, prefixo + papel + "@example.com", await criarHashDaSenha(senha), papel]);
    }
    const admin = await entrar(prefixo + "admin@example.com");
    const aluno = await entrar(prefixo + "aluno@example.com");
    const professor = await entrar(prefixo + "professor@example.com");
    assert.equal((await request(aplicacao).get("/api/parceiros")).status, 401);
    assert.equal((await aluno.agente.get("/api/parceiros/admin")).status, 403);
    assert.equal((await professor.agente.get("/api/parceiros/admin")).status, 403);
    assert.equal((await aluno.agente.post("/api/parceiros").set("X-CSRF-Token", aluno.csrf).send({})).status, 403);
    assert.equal((await admin.agente.post("/api/parceiros").send({})).status, 403);

    const dados = { nome: "Parceiro Um", descricao: "Curso preparatorio", link: "https://example.com/curso",
      cupom: "PLANTEL10", desconto: "10% de desconto", ativo: true, ordem: 20 };
    for (const link of ["javascript:alert(1)", "http://example.com", "https://localhost/x", "https://127.0.0.1/x"]) {
      assert.equal((await admin.agente.post("/api/parceiros").set("X-CSRF-Token", admin.csrf).send({ ...dados, link })).status, 400);
    }
    assert.equal((await admin.agente.post("/api/parceiros").set("X-CSRF-Token", admin.csrf).send({ ...dados, papel: "admin" })).status, 400);
    assert.equal((await admin.agente.post("/api/parceiros").set("X-CSRF-Token", admin.csrf).send({ ...dados, nome: "<script>alert(1)</script>" })).status, 400);

    const primeiro = await admin.agente.post("/api/parceiros").set("X-CSRF-Token", admin.csrf).send(dados);
    assert.equal(primeiro.status, 201);
    const id = primeiro.body.parceiro.id;
    const segundo = await admin.agente.post("/api/parceiros").set("X-CSRF-Token", admin.csrf).send({
      nome: "Parceiro Dois", descricao: "Página institucional", link: "https://example.org", ordem: 1, ativo: true
    });
    assert.equal(segundo.status, 201);
    const terceiro = await admin.agente.post("/api/parceiros").set("X-CSRF-Token", admin.csrf).send({
      nome: "Parceiro Oculto", descricao: "Ainda não publicado", link: "https://example.net", ativo: false
    });
    assert.equal(terceiro.status, 201);
    assert.deepEqual((await aluno.agente.get("/api/parceiros")).body.parceiros.map(item => item.nome), ["Parceiro Dois", "Parceiro Um"]);
    assert.deepEqual((await professor.agente.get("/api/parceiros")).body.parceiros.map(item => item.nome), ["Parceiro Dois", "Parceiro Um"]);
    assert.equal((await admin.agente.get("/api/parceiros/admin")).body.parceiros.length, 3);
    assert.equal(segundo.body.parceiro.cupom, null);
    assert.equal(segundo.body.parceiro.desconto, null);

    const falso = await admin.agente.post("/api/parceiros/" + id + "/imagem").set("X-CSRF-Token", admin.csrf)
      .attach("imagem", Buffer.from("not an image"), { filename: "logo.png", contentType: "image/png" });
    assert.equal(falso.status, 400);
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/FioAAAAASUVORK5CYII=", "base64");
    const imagem = await admin.agente.post("/api/parceiros/" + id + "/imagem").set("X-CSRF-Token", admin.csrf)
      .attach("imagem", png, { filename: "logo.png", contentType: "image/png" });
    assert.equal(imagem.status, 200);
    assert.match(imagem.body.parceiro.imagemUrl, /\/api\/parceiros\/\d+\/imagem\?v=/);
    const leituraImagem = await aluno.agente.get("/api/parceiros/" + id + "/imagem");
    assert.equal(leituraImagem.status, 200);
    assert.equal(leituraImagem.headers["content-type"], "image/png");
    assert.equal(leituraImagem.headers["x-content-type-options"], "nosniff");
    assert.equal((await aluno.agente.post("/api/parceiros/" + id + "/imagem").set("X-CSRF-Token", aluno.csrf)
      .attach("imagem", png, { filename: "logo.png", contentType: "image/png" })).status, 403);

    assert.equal((await admin.agente.patch("/api/parceiros/" + id).set("X-CSRF-Token", admin.csrf)
      .send({ ativo: false, cupom: null, desconto: null })).status, 200);
    assert.equal((await aluno.agente.get("/api/parceiros/" + id + "/imagem")).status, 404);
    assert.deepEqual((await aluno.agente.get("/api/parceiros")).body.parceiros.map(item => item.nome), ["Parceiro Dois"]);
    assert.equal((await admin.agente.delete("/api/parceiros/" + id + "/imagem").set("X-CSRF-Token", admin.csrf)).status, 200);
    const [auditorias] = await pool.execute("SELECT acao FROM auditoria_geral WHERE entidade='parceiro' AND entidade_id=?", [id]);
    assert.deepEqual(auditorias.map(item => item.acao), ["parceiro_criado", "parceiro_imagem_alterada", "parceiro_editado", "parceiro_imagem_removida"]);
  } finally {
    const [parceirosTeste] = await pool.execute(
      "SELECT id FROM parceiros_plantel WHERE nome IN ('Parceiro Um','Parceiro Dois','Parceiro Oculto')"
    );
    for (const parceiro of parceirosTeste) {
      await pool.execute("DELETE FROM auditoria_geral WHERE entidade='parceiro' AND entidade_id=?", [parceiro.id]);
      await pool.execute("DELETE FROM parceiros_plantel WHERE id=?", [parceiro.id]);
    }
    await pool.execute("DELETE FROM sessoes WHERE usuario_id IN (SELECT id FROM usuarios WHERE email LIKE ?)", [prefixo + "%"]);
    await pool.execute("DELETE FROM usuarios WHERE email LIKE ?", [prefixo + "%"]);
  }
});

test.after(async () => pool.end());
