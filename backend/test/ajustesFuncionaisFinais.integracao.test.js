const test = require("node:test");
const assert = require("node:assert/strict");
const pino = require("pino");
const request = require("supertest");
const criarAplicacao = require("../src/app");
const { obterConfiguracao } = require("../src/shared/config/ambiente");
const { criarPool } = require("../src/shared/database/conexao");
const { criarHashDaSenha } = require("../src/modules/autenticacao/senha");
const { criarEmailProviderFake } = require("../src/shared/providers/emailProvider");
const criarAnalyticsRepository = require("../src/modules/analytics/analyticsRepository");
const criarAnalyticsService = require("../src/modules/analytics/analyticsService");

const base = obterConfiguracao();
const configuracao = Object.assign({}, base, {
  ambiente: "test",
  banco: Object.assign({}, base.banco, { nome: process.env.DB_TEST_NAME || base.banco.nome + "_test" }),
  suporte: { destinatario: "suporte-oficial@example.com" },
  seguranca: Object.assign({}, base.seguranca, { limiteSuporte: 20 })
});
const pool = criarPool(configuracao.banco);
const senha = "Senha-ajustes-finais-123";
let emailProvider;
let aplicacao;

async function limpar() {
  await pool.execute("DELETE FROM historico_materiais_usuario");
  await pool.execute("DELETE FROM eventos_uso_acervo");
  await pool.execute("DELETE FROM analytics_resumo_diario");
  await pool.execute("DELETE FROM analytics_materiais_diario");
  await pool.execute("DELETE FROM analytics_buscas_diario");
  await pool.execute("DELETE FROM analytics_pastas_diario");
  await pool.execute("DELETE FROM materiais");
  let removidas = 1;
  while (removidas) {
    const [resultado] = await pool.execute("DELETE c FROM categorias c LEFT JOIN categorias f ON f.categoria_pai_id=c.id WHERE f.id IS NULL");
    removidas = resultado.affectedRows;
  }
  await pool.execute("DELETE FROM sessoes");
  await pool.execute("DELETE FROM usuarios");
}

async function criarUsuario(nome, email, papel) {
  const [resultado] = await pool.execute(
    "INSERT INTO usuarios (nome,email,senha_hash,papel) VALUES (?,?,?,?)",
    [nome, email, await criarHashDaSenha(senha), papel]
  );
  return Number(resultado.insertId);
}

async function autenticar(email) {
  const agente = request.agent(aplicacao);
  const csrf = (await agente.get("/api/autenticacao/csrf")).body.csrfToken;
  const login = await agente.post("/api/autenticacao/login").set("X-CSRF-Token", csrf).send({ email: email, senha: senha });
  assert.equal(login.status, 200);
  return { agente: agente, csrf: csrf };
}

test.beforeEach(async function preparar() {
  await limpar();
  emailProvider = criarEmailProviderFake();
  aplicacao = criarAplicacao(configuracao, pino({ level: "silent" }), { pool: pool, emailProvider: emailProvider });
});

test.after(async function encerrar() { await limpar(); await pool.end(); });

test("suporte usa identidade da sessao, valida papeis, CSRF e destinatario seguro", async function testarSuporte() {
  await criarUsuario("Ana Aluna", "ana@example.com", "aluno");
  await criarUsuario("Paulo Professor", "paulo@example.com", "professor");
  await criarUsuario("Ada Admin", "ada@example.com", "admin");
  const aluno = await autenticar("ana@example.com");
  const professor = await autenticar("paulo@example.com");
  const admin = await autenticar("ada@example.com");

  assert.equal((await request(aplicacao).post("/api/suporte").send({ assunto: "Duvida", mensagem: "Mensagem suficientemente longa" })).status, 401);
  assert.equal((await aluno.agente.post("/api/suporte").send({ assunto: "Duvida", mensagem: "Mensagem suficientemente longa" })).status, 403);
  assert.equal((await admin.agente.post("/api/suporte").set("X-CSRF-Token", admin.csrf).send({ assunto: "Duvida", mensagem: "Mensagem suficientemente longa" })).status, 403);
  assert.equal((await aluno.agente.post("/api/suporte").set("X-CSRF-Token", aluno.csrf).send({ assunto: "A\r\nBcc: invasor@example.com", mensagem: "Mensagem suficientemente longa" })).status, 400);
  assert.equal((await aluno.agente.post("/api/suporte").set("X-CSRF-Token", aluno.csrf).send({ assunto: "Oi", mensagem: "curta" })).status, 400);

  const enviadaAluno = await aluno.agente.post("/api/suporte").set("X-CSRF-Token", aluno.csrf).send({ assunto: "Material", mensagem: "Nao consigo abrir o material indicado." });
  const enviadaProfessor = await professor.agente.post("/api/suporte").set("X-CSRF-Token", professor.csrf).send({ assunto: "Pasta", mensagem: "Preciso de ajuda com uma pasta liberada." });
  assert.equal(enviadaAluno.status, 202);
  assert.equal(enviadaProfessor.status, 202);
  const mensagens = emailProvider.obterMensagens();
  assert.deepEqual(
    { destinatario: mensagens[0].destinatario, nome: mensagens[0].nome, email: mensagens[0].email, papel: mensagens[0].papel },
    { destinatario: "suporte-oficial@example.com", nome: "Ana Aluna", email: "ana@example.com", papel: "aluno" }
  );
  assert.equal(mensagens[1].papel, "professor");
  assert.equal(JSON.stringify(mensagens).includes("senha"), false);
});

test("suporte limita tentativas e controla falha do provider", async function testarFalhasDoSuporte() {
  await criarUsuario("Aluno Falha", "falha@example.com", "aluno");
  const configuracaoRestrita = Object.assign({}, configuracao, {
    seguranca: Object.assign({}, configuracao.seguranca, { limiteSuporte: 1 })
  });
  aplicacao = criarAplicacao(configuracaoRestrita, pino({ level: "silent" }), { pool: pool, emailProvider: emailProvider });
  const aluno = await autenticar("falha@example.com");
  const corpo = { assunto: "Ajuda", mensagem: "Preciso de ajuda com este material." };
  assert.equal((await aluno.agente.post("/api/suporte").set("X-CSRF-Token", aluno.csrf).send(corpo)).status, 202);
  assert.equal((await aluno.agente.post("/api/suporte").set("X-CSRF-Token", aluno.csrf).send(corpo)).status, 429);

  const providerComFalha = { enviarSuporte: async function falhar() { throw new Error("smtp indisponivel com segredo oculto"); } };
  aplicacao = criarAplicacao(configuracao, pino({ level: "silent" }), { pool: pool, emailProvider: providerComFalha });
  const novaSessao = await autenticar("falha@example.com");
  const resposta = await novaSessao.agente.post("/api/suporte").set("X-CSRF-Token", novaSessao.csrf).send(corpo);
  assert.equal(resposta.status, 503);
  assert.equal(resposta.body.erro.codigo, "SUPORTE_INDISPONIVEL");
  assert.equal(JSON.stringify(resposta.body).includes("segredo"), false);
});

test("retencao consolida eventos antigos e preserva metricas e historico pessoal", async function testarRetencao() {
  const alunoId = await criarUsuario("Aluno Analytics", "analytics-final@example.com", "aluno");
  const adminId = await criarUsuario("Admin Analytics", "admin-final@example.com", "admin");
  const [pasta] = await pool.execute("INSERT INTO categorias (nome,drive_pasta_id) VALUES (?,?)", ["PASTA_RETENCAO", "drive-retencao"]);
  const [material] = await pool.execute(
    "INSERT INTO materiais (drive_file_id,categoria_id,nome,mime_type,tipo,extensao) VALUES (?,?,?,?,?,?)",
    ["arquivo-retencao", pasta.insertId, "Material historico.pdf", "application/pdf", "pdf", "pdf"]
  );
  const dataAntiga = new Date();
  dataAntiga.setUTCDate(dataAntiga.getUTCDate() - 10);
  await pool.execute(
    "INSERT INTO eventos_uso_acervo (usuario_id,material_id,categoria_id,tipo,termo_busca,chave_deduplicacao,criado_em) VALUES "
    + "(?,?,NULL,'visualizacao',NULL,'ret-vis',?),(?,?,NULL,'download',NULL,'ret-down',?),(?,NULL,?,'acesso',NULL,'ret-access',?),(?,NULL,?,'busca','cinematica','ret-search',?)",
    [alunoId, material.insertId, dataAntiga, alunoId, material.insertId, dataAntiga, alunoId, pasta.insertId, dataAntiga, alunoId, pasta.insertId, dataAntiga]
  );
  await pool.execute(
    "INSERT INTO historico_materiais_usuario (usuario_id,material_id,ultima_acao,ultima_visualizacao_em,ultimo_download_em,atualizado_em) VALUES (?,?, 'download',?,?,?)",
    [alunoId, material.insertId, dataAntiga, dataAntiga, dataAntiga]
  );
  const service = criarAnalyticsService(criarAnalyticsRepository(pool));
  const limite = new Date();
  limite.setUTCDate(limite.getUTCDate() - 5);
  const resultado = await service.executarRetencao({ retencaoEventosDias: 5, loteRetencao: 100 });
  assert.equal(resultado.eventosRemovidos, 4);
  const [brutos] = await pool.execute("SELECT COUNT(*) AS total FROM eventos_uso_acervo");
  assert.equal(Number(brutos[0].total), 0);
  const painel = await service.obterPainel({ periodo: 30 });
  assert.equal(painel.evolucao[0].visualizacoes, 1);
  assert.equal(painel.evolucao[0].downloads, 1);
  assert.equal(painel.evolucao[0].alunosAtivos, 1);
  assert.equal(painel.materiaisMaisUsados[0].nome, "Material historico.pdf");
  assert.equal(painel.termosMaisPesquisados[0].termo, "cinematica");
  const [historico] = await pool.execute("SELECT COUNT(*) AS total FROM historico_materiais_usuario WHERE usuario_id=?", [alunoId]);
  assert.equal(Number(historico[0].total), 1);
  assert.ok(adminId > 0);
});
