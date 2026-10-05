const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const mysql = require("mysql2/promise");
const request = require("supertest");
const pino = require("pino");
const { obterConfiguracao } = require("../src/shared/config/ambiente");
const { criarPool } = require("../src/shared/database/conexao");
const criarRepository = require("../src/modules/usuarios/usuarioRepository");
const criarAplicacao = require("../src/app");
const { criarHashDaSenha } = require("../src/modules/autenticacao/senha");
const { criarEmailProviderFake } = require("../src/shared/providers/emailProvider");
const executarMigrations = require("../scripts/executarMigrations");

// Banco novo, descartavel: nunca retirar indice nem inserir legados em banco real.
const base = obterConfiguracao();
const nome = "plantel_email_qa_" + crypto.randomBytes(6).toString("hex");
const cfg = { ...base, ambiente: "test", confiarProxy: false,
  banco: { ...base.banco, nome }, seguranca: { ...base.seguranca, limiteCadastro: 100, limiteAutenticacao: 100 } };
let controle, pool, repo, app, hash, legadoAntes, bancoCriado = false;
const senha = "Senha-ficticia-email-2026";
const duplicado = erro => erro.codigo === "EMAIL_JA_CADASTRADO" && erro.statusCode === 409;

async function csrf(agente) { return (await agente.get("/api/autenticacao/csrf")).body.csrfToken; }
async function cadastrar(email) {
  const agente = request.agent(app);
  const token = await csrf(agente);
  return agente.post("/api/autenticacao/cadastro").set("X-CSRF-Token", token).send({ nome: "Conta QA", email, senha });
}
async function admin() {
  const agente = request.agent(app), token = await csrf(agente);
  const r = await agente.post("/api/autenticacao/login").set("X-CSRF-Token", token).send({ email: "admin@gmail.com", senha });
  assert.equal(r.status, 200);
  return { agente, token: await csrf(agente) };
}

test.before(async () => {
  assert.ok(["127.0.0.1", "localhost", "::1"].includes(base.banco.host));
  controle = await mysql.createConnection({ host: base.banco.host, port: base.banco.porta, user: base.banco.usuario, password: base.banco.senha });
  await controle.query("CREATE DATABASE `" + nome + "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
  bancoCriado = true;
  await executarMigrations(cfg);
  pool = criarPool(cfg.banco); repo = criarRepository(pool);
  hash = await criarHashDaSenha(senha);
  await pool.query("ALTER TABLE usuarios DROP INDEX uq_usuarios_email");
  await pool.query("DROP TABLE usuarios_email_travas");
  for (const email of ["Legado@gmail.com", "Legado@gmail.com", "  LEGADO@gmail.com  "]) {
    await pool.execute("INSERT INTO usuarios(nome,email,senha_hash,papel,ativo) VALUES ('Historico',?,?,'professor',0)", [email, hash]);
  }
  [legadoAntes] = await pool.query("SELECT * FROM usuarios ORDER BY id");
  console.log("Inventario QA antes da 024: 3 usuarios sinteticos, 1 grupo duplicado; nenhum usuario real.");
  await pool.query(await fs.readFile(path.resolve(__dirname, "../migrations/024_unicidade_email_novas_contas.sql"), "utf8"));
  const [depois] = await pool.query("SELECT * FROM usuarios ORDER BY id");
  assert.deepEqual(depois, legadoAntes);
  await repo.criarAdmin("Admin QA", "admin@gmail.com", hash);
  app = criarAplicacao(cfg, pino({ level: "silent" }), { pool, emailProvider: criarEmailProviderFake() });
});

test.after(async () => {
  await pool?.end();
  if (bancoCriado && /^plantel_email_qa_[a-f0-9]{12}$/.test(nome)) await controle.query("DROP DATABASE `" + nome + "`");
  await controle?.end();
});

test("cadastro publico bloqueia repeticao, maiusculas, espacos e legado inativo sem UNIQUE em usuarios", async () => {
  assert.equal((await cadastrar("Teste@gmail.com")).status, 201);
  for (const email of ["teste@gmail.com", "TESTE@gmail.com", " teste@gmail.com ", "legado@gmail.com"]) {
    const r = await cadastrar(email);
    assert.equal(r.status, 409);
    assert.equal(r.body.erro.codigo, "EMAIL_JA_CADASTRADO");
    assert.match(r.body.erro.mensagem, /[Ee]-mail.*(conta|cadastrad)/);
  }
  assert.equal((await cadastrar("diferente@gmail.com")).status, 201);
  for (const email of ["pessoa@gmail.com", "pes.soa@gmail.com", "pessoa+alias@gmail.com"]) assert.equal((await cadastrar(email)).status, 201);
});

test("duas requisicoes simultaneas criam exatamente uma conta com email normalizado", async () => {
  const resultados = await Promise.all([cadastrar("Concorrencia@gmail.com"), cadastrar(" concorrencia@gmail.com ")]);
  assert.deepEqual(resultados.map(r => r.status).sort(), [201, 409]);
  const [[r]] = await pool.query("SELECT COUNT(*) n FROM cadastros_publicos_pendentes WHERE email='concorrencia@gmail.com'");
  assert.equal(r.n, 1);
  const [[usuarios]] = await pool.query("SELECT COUNT(*) n FROM usuarios WHERE email='concorrencia@gmail.com'");
  assert.equal(usuarios.n,0);
});

test("admin e criacao interna de todos os papeis rejeitam email ocupado", async () => {
  const { agente, token } = await admin();
  for (const papel of ["aluno", "professor", "admin"]) {
    const r = await agente.post("/api/usuarios").set("X-CSRF-Token", token).send({ nome: "Nova conta", email: " LEGADO@gmail.com ", senha, papel });
    assert.equal(r.status, 409);
    await assert.rejects(repo.criar("Nova conta", " LEGADO@gmail.com ", hash, papel), duplicado);
  }
  await assert.rejects(repo.criarAdmin("Bootstrap", "Legado@gmail.com", hash), duplicado);
});

test("edicao rejeita email ocupado; alteracao simultanea e cadastro nao duplicam", async () => {
  const b = await repo.criarAluno("Editavel", "editavel@gmail.com", hash);
  const { agente, token } = await admin();
  const r = await agente.patch("/api/usuarios/" + b.id).set("X-CSRF-Token", token).send({ nome: "Outro nome", email: " LEGADO@gmail.com " });
  assert.equal(r.status, 409);
  await assert.rejects(repo.atualizarEmail(b.id, "LEGADO@gmail.com"), duplicado);
  assert.equal((await repo.buscarPorId(b.id)).email, "editavel@gmail.com");
  const resultados = await Promise.allSettled([
    repo.atualizarEmail(b.id, "destino@gmail.com"),
    repo.criarAluno("Concorrente", " DESTINO@gmail.com ", hash)
  ]);
  assert.equal(resultados.filter(r => r.status === "fulfilled").length, 1);
  assert.ok(duplicado(resultados.find(r => r.status === "rejected").reason));
  const [[contagem]] = await pool.query("SELECT COUNT(*) n FROM usuarios WHERE email='destino@gmail.com'");
  assert.equal(contagem.n, 1);
});

test("rollback da auditoria libera email; transacao com snapshot anterior ve cadastro confirmado", async () => {
  await assert.rejects(repo.comTravaAdministrativa(async c => {
    await repo.criar("Rollback", "rollback@gmail.com", hash, "professor", c);
    throw new Error("auditoria simulada");
  }), /auditoria simulada/);
  await repo.criarAluno("Depois", "rollback@gmail.com", hash);
  const c = await pool.getConnection();
  try {
    await c.beginTransaction();
    await c.query("SELECT COUNT(*) FROM usuarios");
    await repo.criarAluno("Snapshot", "snapshot@gmail.com", hash);
    await assert.rejects(repo.criar("Snapshot antigo", "SNAPSHOT@gmail.com", hash, "aluno", c), duplicado);
    await c.rollback();
  } finally { c.release(); }
});

test("todas as contas historicas ficam intactas, inclusive email, hash, role e status", async () => {
  const [depois] = await pool.query("SELECT * FROM usuarios WHERE id<=3 ORDER BY id");
  assert.deepEqual(depois, legadoAntes);
});
