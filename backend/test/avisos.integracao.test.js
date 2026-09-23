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

    const primeiro = await admin.agente.post("/api/avisos").set("X-CSRF-Token", admin.csrf)
      .send({ texto: "Biblioteca atualizada hoje", ativo: true, ordem: 20 });
    assert.equal(primeiro.status, 201);
    const segundo = await admin.agente.post("/api/avisos").set("X-CSRF-Token", admin.csrf)
      .send({ texto: "Novo simulado disponivel", ativo: true, ordem: 1 });
    const oculto = await admin.agente.post("/api/avisos").set("X-CSRF-Token", admin.csrf)
      .send({ texto: "Ainda em revisao", ativo: false });
    assert.equal(segundo.status, 201);
    assert.equal(oculto.status, 201);
    assert.deepEqual((await aluno.agente.get("/api/avisos")).body.avisos.map(item => item.texto), ["Novo simulado disponivel", "Biblioteca atualizada hoje"]);
    assert.deepEqual((await professor.agente.get("/api/avisos")).body.avisos.map(item => item.texto), ["Novo simulado disponivel", "Biblioteca atualizada hoje"]);
    assert.equal((await admin.agente.get("/api/avisos/admin")).body.avisos.length, 3);
    assert.equal((await admin.agente.patch("/api/avisos/" + primeiro.body.aviso.id).set("X-CSRF-Token", admin.csrf).send({ ativo: false })).status, 200);
    const [auditorias] = await pool.execute("SELECT acao FROM auditoria_geral WHERE entidade='aviso_biblioteca' ORDER BY id");
    assert.deepEqual(auditorias.map(item => item.acao), ["aviso_criado", "aviso_criado", "aviso_criado", "aviso_editado"]);
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

test.after(async () => pool.end());
