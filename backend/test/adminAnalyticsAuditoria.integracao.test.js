const test = require("node:test");
const assert = require("node:assert/strict");
const pino = require("pino");
const request = require("supertest");
const criarAplicacao = require("../src/app");
const { obterConfiguracao } = require("../src/shared/config/ambiente");
const { criarPool } = require("../src/shared/database/conexao");
const { criarHashDaSenha } = require("../src/modules/autenticacao/senha");
const { criarEmailProviderFake } = require("../src/shared/providers/emailProvider");

const base = obterConfiguracao();
const configuracao = Object.assign({}, base, {
  ambiente: "test",
  nivelDeLog: "silent",
  banco: Object.assign({}, base.banco, { nome: process.env.DB_TEST_NAME || base.banco.nome + "_test" })
});
const pool = criarPool(configuracao.banco);
const senha = "Senha-admin-fase-7-123";
let aplicacao;

async function limpar() {
  await pool.execute("DELETE FROM eventos_uso_acervo");
  await pool.execute("DELETE FROM auditoria_geral");
  await pool.execute("DELETE FROM auditoria_materiais");
  await pool.execute("DELETE FROM permissoes_professor_categoria");
  await pool.execute("DELETE FROM materiais");
  let removidas = 1;
  while (removidas) {
    const [resultado] = await pool.execute("DELETE c FROM categorias c LEFT JOIN categorias f ON f.categoria_pai_id=c.id WHERE f.id IS NULL");
    removidas = resultado.affectedRows;
  }
  await pool.execute("DELETE FROM recuperacoes_senha");
  await pool.execute("DELETE FROM sessoes");
  await pool.execute("DELETE FROM credenciais_google_drive");
  await pool.execute("DELETE FROM sincronizacoes_google_drive");
  await pool.execute("DELETE FROM usuarios");
}

async function usuario(email, papel) {
  const [resultado] = await pool.execute("INSERT INTO usuarios (email,senha_hash,papel) VALUES (?,?,?)", [email, await criarHashDaSenha(senha), papel]);
  return Number(resultado.insertId);
}

async function sessao(email) {
  const agente = request.agent(aplicacao);
  const csrf = (await agente.get("/api/autenticacao/csrf")).body.csrfToken;
  const login = await agente.post("/api/autenticacao/login").set("X-CSRF-Token", csrf).send({ email: email, senha: senha });
  assert.equal(login.status, 200);
  return { agente: agente, csrf: csrf };
}

test.beforeEach(async function preparar() {
  await limpar();
  aplicacao = criarAplicacao(configuracao, pino({ level: "silent" }), { pool: pool, emailProvider: criarEmailProviderFake() });
});

test.after(async function encerrar() { await limpar(); await pool.end(); });

test("admin cria, pesquisa e filtra usuarios sem expor campos internos", async function testarUsuarios() {
  const adminId = await usuario("admin-f7@example.com", "admin");
  const admin = await sessao("admin-f7@example.com");
  const semCsrf = await admin.agente.post("/api/usuarios").send({ email: "novo@example.com", senha: senha, papel: "professor" });
  assert.equal(semCsrf.status, 403);
  const criado = await admin.agente.post("/api/usuarios").set("X-CSRF-Token", admin.csrf).send({ email: "novo@example.com", senha: senha, papel: "professor" });
  assert.equal(criado.status, 201);
  assert.equal(Object.hasOwn(criado.body.usuario, "senhaHash"), false);
  const filtrados = await admin.agente.get("/api/usuarios?busca=novo&papel=professor&ativo=true&limite=10&pagina=1");
  assert.equal(filtrados.status, 200);
  assert.equal(filtrados.body.usuarios.length, 1);
  assert.equal(filtrados.body.paginacao.total, 1);
  assert.equal(JSON.stringify(filtrados.body).includes("senha_hash"), false);
  assert.equal((await admin.agente.get("/api/usuarios?limite=101")).status, 400);
  assert.equal((await admin.agente.get("/api/usuarios?busca=%27%20OR%201%3D1--")).body.paginacao.total, 0);
  const massa = await admin.agente.patch("/api/usuarios/" + criado.body.usuario.id).set("X-CSRF-Token", admin.csrf).send({ email: "x@example.com", ativo: false });
  assert.equal(massa.status, 400);
  assert.equal((await admin.agente.patch("/api/usuarios/999999").set("X-CSRF-Token", admin.csrf).send({ email: "ausente@example.com" })).status, 404);
  assert.equal((await admin.agente.post("/api/usuarios/" + criado.body.usuario.id + "/redefinicao-senha").set("X-CSRF-Token", admin.csrf).send({})).status, 200);
  const proprioPapel = await admin.agente.patch("/api/usuarios/" + adminId + "/papel").set("X-CSRF-Token", admin.csrf).send({ papel: "aluno" });
  assert.equal(proprioPapel.status, 409);
  assert.equal((await admin.agente.patch("/api/usuarios/" + adminId + "/ativo").set("X-CSRF-Token", admin.csrf).send({ ativo: false })).status, 409);
  const professor = await sessao("novo@example.com");
  assert.equal((await professor.agente.get("/api/usuarios")).status, 403);
  const bloqueado = await admin.agente.patch("/api/usuarios/" + criado.body.usuario.id + "/ativo").set("X-CSRF-Token", admin.csrf).send({ ativo: false });
  assert.equal(bloqueado.status, 200);
  assert.equal((await professor.agente.get("/api/gestao-materiais/pastas")).status, 401);
});

test("remover papel de professor revoga acessos e sessoes imediatamente", async function testarRevogacao() {
  const adminId = await usuario("admin-permissao@example.com", "admin");
  const professorId = await usuario("professor-permissao@example.com", "professor");
  const [pasta] = await pool.execute("INSERT INTO categorias (nome,drive_pasta_id) VALUES (?,?)", ["PASTA_FASE_7", "drive-fase-7"]);
  const [outraPasta] = await pool.execute("INSERT INTO categorias (nome,drive_pasta_id) VALUES (?,?)", ["OUTRA_PASTA_FASE_7", "outro-drive-fase-7"]);
  const categoriaId = Number(pasta.insertId);
  const admin = await sessao("admin-permissao@example.com");
  const professor = await sessao("professor-permissao@example.com");
  const lote = await admin.agente.put("/api/permissoes/professores/" + professorId).set("X-CSRF-Token", admin.csrf).send({ categoriaIds: [categoriaId, Number(outraPasta.insertId)] });
  assert.equal(lote.status, 200);
  assert.equal(lote.body.permissoes.length, 2);
  assert.equal((await professor.agente.get("/api/gestao-materiais/pastas")).body.length, 2);
  const revogado = await admin.agente.put("/api/permissoes/professores/" + professorId).set("X-CSRF-Token", admin.csrf).send({ categoriaIds: [Number(outraPasta.insertId)] });
  assert.equal(revogado.status, 200);
  const pastasDepoisDaRevogacao = await professor.agente.get("/api/gestao-materiais/pastas");
  assert.equal(pastasDepoisDaRevogacao.body.length, 1);
  assert.equal(pastasDepoisDaRevogacao.body[0].id, Number(outraPasta.insertId));
  const demovido = await admin.agente.patch("/api/usuarios/" + professorId + "/papel").set("X-CSRF-Token", admin.csrf).send({ papel: "aluno" });
  assert.equal(demovido.status, 200);
  assert.equal((await professor.agente.get("/api/gestao-materiais/pastas")).status, 401);
  const [ativas] = await pool.execute("SELECT COUNT(*) AS total FROM permissoes_professor_categoria WHERE professor_id=? AND revogada_em IS NULL", [professorId]);
  assert.equal(Number(ativas[0].total), 0);
  assert.ok(adminId > 0);
});

test("analytics agrega uso e permanece exclusivo de admin", async function testarAnalytics() {
  const adminId = await usuario("admin-analytics@example.com", "admin");
  const alunoId = await usuario("aluno-analytics@example.com", "aluno");
  const [pasta] = await pool.execute("INSERT INTO categorias (nome,drive_pasta_id) VALUES (?,?)", ["ANALYTICS_F7", "drive-analytics-f7"]);
  const [material] = await pool.execute("INSERT INTO materiais (drive_file_id,drive_parent_file_id,categoria_id,nome,mime_type,tipo,extensao,disponivel,estado_gestao) VALUES (?,?,?,?,?,'pdf','pdf',1,'disponivel')", ["arquivo-analytics-f7", "drive-analytics-f7", pasta.insertId, "Material analytics", "application/pdf"]);
  await pool.execute(
    "INSERT INTO eventos_uso_acervo (usuario_id,material_id,categoria_id,tipo,termo_busca,chave_deduplicacao) VALUES (?,?,NULL,?,NULL,?),(?,?,NULL,?,NULL,?),(?,NULL,?,'acesso',NULL,?),(?,NULL,?,'busca',?,?)",
    [alunoId, material.insertId, "visualizacao", "vis-f7", alunoId, material.insertId, "download", "down-f7",
      alunoId, pasta.insertId, "access-f7", alunoId, pasta.insertId, "material analytics", "search-f7"]
  );
  const admin = await sessao("admin-analytics@example.com");
  const aluno = await sessao("aluno-analytics@example.com");
  const painel = await admin.agente.get("/api/analytics?periodo=30");
  assert.equal(painel.status, 200);
  assert.equal(painel.body.resumo.pdfs, 1);
  assert.equal(painel.body.materiaisMaisUsados[0].visualizacoes, 1);
  assert.equal(painel.body.materiaisMaisUsados[0].downloads, 1);
  assert.equal(painel.body.evolucao[0].acessos, 1);
  assert.equal(painel.body.evolucao[0].alunosAtivos, 1);
  assert.equal(painel.body.termosMaisPesquisados[0].termo, "material analytics");
  assert.equal(painel.body.pastasMaisAcessadas[0].nome, "ANALYTICS_F7");
  assert.equal((await aluno.agente.get("/api/analytics")).status, 403);
  assert.equal((await admin.agente.get("/api/analytics?periodo=999")).status, 400);
  assert.ok(adminId > 0);
});

test("historico registra autoria, filtra, pagina e nao oferece mutacao", async function testarAuditoria() {
  await usuario("admin-auditoria@example.com", "admin");
  const admin = await sessao("admin-auditoria@example.com");
  await admin.agente.post("/api/usuarios").set("X-CSRF-Token", admin.csrf).send({ email: "auditado@example.com", senha: senha, papel: "aluno" });
  const historico = await admin.agente.get("/api/auditoria?acao=usuario_criado&limite=10&pagina=1");
  assert.equal(historico.status, 200);
  assert.equal(historico.body.eventos[0].ator, "admin-auditoria@example.com");
  assert.equal(historico.body.eventos[0].acao, "usuario_criado");
  assert.equal(historico.body.eventos[0].descricao, "Usuário");
  assert.equal(Object.hasOwn(historico.body.eventos[0], "entidadeId"), false);
  assert.equal(Object.hasOwn(historico.body.eventos[0], "contexto"), false);
  assert.equal(JSON.stringify(historico.body).includes(senha), false);
  assert.equal((await admin.agente.delete("/api/auditoria/1").set("X-CSRF-Token", admin.csrf)).status, 404);
  assert.equal((await admin.agente.patch("/api/auditoria/1").set("X-CSRF-Token", admin.csrf).send({ acao: "alterada" })).status, 404);
});
