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
const senha = "Senha-avisos-teste-123";

async function entrar(email) {
  const agente = request.agent(aplicacao);
  const csrf = (await agente.get("/api/autenticacao/csrf")).body.csrfToken;
  assert.equal((await agente.post("/api/autenticacao/login").set("X-CSRF-Token", csrf).send({ email, senha })).status, 200);
  return { agente, csrf };
}

test("avisos: admin gerencia, usuarios veem apenas ativos e CSRF protege mutacoes", async () => {
  const prefixo = "avisos-teste-";
  try {
    for (const [nome, papel] of [["Admin Avisos", "admin"], ["Aluno Avisos", "aluno"], ["Professor Avisos", "professor"]]) {
      await pool.execute("INSERT INTO usuarios (nome,email,senha_hash,papel) VALUES (?,?,?,?)",
        [nome, prefixo + papel + "@example.com", await criarHashDaSenha(senha), papel]);
    }
    const admin = await entrar(prefixo + "admin@example.com");
    const aluno = await entrar(prefixo + "aluno@example.com");
    const professor = await entrar(prefixo + "professor@example.com");
    assert.equal((await request(aplicacao).get("/api/avisos")).status, 401);
    assert.equal((await aluno.agente.get("/api/avisos/admin")).status, 403);
    assert.equal((await professor.agente.post("/api/avisos").set("X-CSRF-Token", professor.csrf).send({ texto: "Nao pode" })).status, 403);
    assert.equal((await admin.agente.post("/api/avisos").send({ texto: "Sem CSRF" })).status, 403);
    assert.equal((await admin.agente.post("/api/avisos").set("X-CSRF-Token", admin.csrf).send({ texto: "<script>" })).status, 400);
    assert.equal((await admin.agente.post("/api/avisos").set("X-CSRF-Token", admin.csrf).send({ texto: "Texto", papel: "admin" })).status, 400);
    assert.equal((await admin.agente.post("/api/avisos").set("X-CSRF-Token", admin.csrf).send({ texto: "Link inseguro", url: "javascript:alert(1)" })).status, 400);
    assert.equal((await admin.agente.post("/api/avisos").set("X-CSRF-Token", admin.csrf).send({ texto: "Link sem TLS", url: "http://example.com" })).status, 400);

    const primeiro = await admin.agente.post("/api/avisos").set("X-CSRF-Token", admin.csrf)
      .send({ texto: "Biblioteca atualizada hoje", url: "https://parceiro.example.com/oferta", ativo: true, ordem: 20 });
    assert.equal(primeiro.status, 201);
    assert.equal(primeiro.body.aviso.url, "https://parceiro.example.com/oferta");
    const segundo = await admin.agente.post("/api/avisos").set("X-CSRF-Token", admin.csrf)
      .send({ texto: "Novo simulado disponivel", ativo: true, ordem: 1 });
    const oculto = await admin.agente.post("/api/avisos").set("X-CSRF-Token", admin.csrf)
      .send({ texto: "Ainda em revisao", ativo: false });
    assert.equal(segundo.status, 201);
    assert.equal(oculto.status, 201);
    assert.deepEqual((await aluno.agente.get("/api/avisos")).body.avisos.map(item => item.texto), ["Novo simulado disponivel", "Biblioteca atualizada hoje"]);
    assert.equal((await aluno.agente.get("/api/avisos")).body.avisos[1].url, "https://parceiro.example.com/oferta");
    assert.deepEqual((await professor.agente.get("/api/avisos")).body.avisos.map(item => item.texto), ["Novo simulado disponivel", "Biblioteca atualizada hoje"]);
    assert.equal((await admin.agente.get("/api/avisos/admin")).body.avisos.length, 3);
    assert.equal((await admin.agente.patch("/api/avisos/" + primeiro.body.aviso.id).set("X-CSRF-Token", admin.csrf).send({ ativo: false })).status, 200);
    assert.deepEqual((await aluno.agente.get("/api/avisos")).body.avisos.map(item => item.texto), ["Novo simulado disponivel"]);
    assert.equal((await admin.agente.patch("/api/avisos/" + primeiro.body.aviso.id).set("X-CSRF-Token", admin.csrf).send({ url: "" })).body.aviso.url, null);
    const [auditorias] = await pool.execute("SELECT acao FROM auditoria_geral WHERE entidade='aviso_biblioteca' ORDER BY id");
    assert.deepEqual(auditorias.map(item => item.acao), ["aviso_criado", "aviso_criado", "aviso_criado", "aviso_editado", "aviso_editado"]);
  } finally {
    const [ids] = await pool.execute("SELECT id FROM avisos_biblioteca WHERE texto IN (?,?,?)", ["Biblioteca atualizada hoje", "Novo simulado disponivel", "Ainda em revisao"]);
    for (const item of ids) {
      await pool.execute("DELETE FROM auditoria_geral WHERE entidade='aviso_biblioteca' AND entidade_id=?", [item.id]);
      await pool.execute("DELETE FROM avisos_biblioteca WHERE id=?", [item.id]);
    }
    await pool.execute("DELETE FROM sessoes WHERE usuario_id IN (SELECT id FROM usuarios WHERE email LIKE ?)", [prefixo + "%"]);
    await pool.execute("DELETE FROM usuarios WHERE email LIKE ?", [prefixo + "%"]);
  }
});

test("migration cadastra parceiros sem truncar, duplicar ou sobrescrever avisos arquivados", async () => {
  const fs = require("node:fs/promises");
  const path = require("node:path");
  const urls = ["https://migration-avisos.example.com/ativo?ref=Plantel", "https://migration-avisos.example.com/inativo", "https://migration-avisos.example.com/existente"];
  const descricao = "Preparação ".repeat(20).trim();
  try {
    for (const [nome, url, ativo, ordem] of [["Parceiro teste", urls[0], 1, 3], ["Duplicado", urls[0], 1, 4], ["Inativo", urls[1], 0, 5], ["Existente", urls[2], 1, 6]]) {
      await pool.execute("INSERT INTO parceiros_plantel (nome,descricao,url_externa,ativo,ordem,cupom,desconto) VALUES (?,?,?,?,?,?,?)",
        [nome, descricao, url, ativo, ordem, "PLANTEL10", "10%"]);
    }
    await pool.execute("INSERT INTO avisos_biblioteca (texto,url,ativo,ordem) VALUES (?,?,0,99)", ["Texto editado pelo admin", urls[2]]);
    const sql = await fs.readFile(path.resolve(__dirname, "../migrations/022_cadastrar_avisos_parceiros.sql"), "utf8");
    for (let rodada = 0; rodada < 2; rodada++) {
      for (const comando of sql.split(";").filter(item => item.trim())) await pool.query(comando);
      const [avisos] = await pool.execute("SELECT texto,url,ativo,ordem FROM avisos_biblioteca WHERE url IN (?,?,?) ORDER BY ordem", urls);
      assert.equal(avisos.length, 3);
      assert.equal(avisos[0].texto, `Parceiro teste · ${descricao} · 10% · Cupom: PLANTEL10`);
      assert.equal(avisos[0].url, urls[0]);
      assert.equal(avisos[0].ativo, 1);
      assert.equal(avisos[1].ativo, 0);
      assert.equal(avisos[2].texto, "Texto editado pelo admin");
      assert.equal(avisos[2].ativo, 0);
      assert.equal(avisos[2].ordem, 99);
    }
  } finally {
    await pool.execute("DELETE FROM avisos_biblioteca WHERE url IN (?,?,?)", urls);
    await pool.execute("DELETE FROM parceiros_plantel WHERE url_externa IN (?,?,?)", urls);
  }
});

test.after(async () => pool.end());
