const test = require("node:test");
const assert = require("node:assert/strict");
const pino = require("pino");
const request = require("supertest");
const criarAplicacao = require("../src/app");
const { obterConfiguracao } = require("../src/shared/config/ambiente");
const { criarPool } = require("../src/shared/database/conexao");
const { criarEmailProviderFake } = require("../src/shared/providers/emailProvider");
const { criarHashDaSenha } = require("../src/modules/autenticacao/senha");

const configuracaoBase = obterConfiguracao();
const nomeBancoTeste = process.env.DB_TEST_NAME || configuracaoBase.banco.nome + "_test";
const configuracaoTeste = Object.assign({}, configuracaoBase, {
  ambiente: "test",
  nivelDeLog: "silent",
  banco: Object.assign({}, configuracaoBase.banco, { nome: nomeBancoTeste }),
  seguranca: Object.assign({}, configuracaoBase.seguranca, {
    limiteAutenticacao: 1000,
    limiteRecuperacao: 1000
  })
});
const pool = criarPool(configuracaoTeste.banco);
const logger = pino({ level: "silent" });
const aplicacao = criarAplicacao(configuracaoTeste, logger, {
  pool: pool,
  emailProvider: criarEmailProviderFake()
});
const senhaPadrao = "Senha-forte-fase-3";
let usuarios;

async function limparCategorias() {
  let removidas = 1;

  while (removidas > 0) {
    const [resultado] = await pool.execute(
      "DELETE categoria FROM categorias categoria "
      + "LEFT JOIN categorias filha ON filha.categoria_pai_id = categoria.id "
      + "WHERE filha.id IS NULL"
    );
    removidas = resultado.affectedRows;
  }
}

async function limparBanco() {
  await pool.execute("DELETE FROM permissoes_professor_categoria");
  await pool.execute("DELETE FROM materiais");
  await limparCategorias();
  await pool.execute("DELETE FROM disciplinas");
  await pool.execute("DELETE FROM concursos");
  await pool.execute("DELETE FROM credenciais_google_drive");
  await pool.execute("DELETE FROM estados_oauth_google_drive");
  await pool.execute("DELETE FROM sincronizacoes_google_drive");
  await pool.execute("DELETE FROM recuperacoes_senha");
  await pool.execute("DELETE FROM sessoes");
  await pool.execute("DELETE FROM usuarios");
}

async function criarUsuario(email, papel) {
  const senhaHash = await criarHashDaSenha(senhaPadrao);
  const [resultado] = await pool.execute(
    "INSERT INTO usuarios (email, senha_hash, papel) VALUES (?, ?, ?)",
    [email, senhaHash, papel]
  );
  return { id: resultado.insertId, email: email, papel: papel };
}

async function prepararUsuarios() {
  usuarios = {
    admin: await criarUsuario("admin-fase3@example.com", "admin"),
    professor: await criarUsuario("professor-fase3@example.com", "professor"),
    professorDois: await criarUsuario("professor-dois-fase3@example.com", "professor"),
    aluno: await criarUsuario("aluno-fase3@example.com", "aluno")
  };
}

async function obterCsrf(agente) {
  const resposta = await agente.get("/api/autenticacao/csrf");
  assert.equal(resposta.status, 200);
  return resposta.body.csrfToken;
}

async function autenticar(chave) {
  const usuario = usuarios[chave];
  const agente = request.agent(aplicacao);
  const csrf = await obterCsrf(agente);
  const resposta = await agente
    .post("/api/autenticacao/login")
    .set("X-CSRF-Token", csrf)
    .send({ email: usuario.email, senha: senhaPadrao });
  assert.equal(resposta.status, 200);
  return { agente: agente, csrf: csrf, usuario: usuario };
}

async function criarCategoria(sessao, dados) {
  return sessao.agente
    .post("/api/categorias")
    .set("X-CSRF-Token", sessao.csrf)
    .send(dados);
}

async function criarClassificacao(sessao, rota, nome) {
  return sessao.agente
    .post(rota)
    .set("X-CSRF-Token", sessao.csrf)
    .send({ nome: nome });
}

test.beforeEach(async function prepararTeste() {
  await limparBanco();
  await prepararUsuarios();
});

test.after(async function encerrarTeste() {
  await limparBanco();
  await pool.end();
});

test("migration cria tabelas InnoDB, indices e constraints da fase 3", async function testarMigration() {
  const [tabelas] = await pool.execute(
    "SELECT TABLE_NAME, ENGINE, TABLE_COLLATION FROM information_schema.TABLES "
    + "WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (?, ?, ?, ?) ORDER BY TABLE_NAME",
    [nomeBancoTeste, "categorias", "disciplinas", "concursos", "permissoes_professor_categoria"]
  );
  assert.equal(tabelas.length, 4);
  tabelas.forEach(function validarTabela(tabela) {
    assert.equal(tabela.ENGINE, "InnoDB");
    assert.equal(tabela.TABLE_COLLATION, "utf8mb4_unicode_ci");
  });

  const [indices] = await pool.execute(
    "SELECT INDEX_NAME FROM information_schema.STATISTICS "
    + "WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND NON_UNIQUE = 0",
    [nomeBancoTeste, "permissoes_professor_categoria"]
  );
  assert.equal(indices.some(function encontrarIndice(indice) {
    return indice.INDEX_NAME === "uq_permissoes_professor_categoria";
  }), true);
});

test("admin cria hierarquia e catalogos visiveis para aluno", async function testarEstruturaPublica() {
  const admin = await autenticar("admin");
  const aluno = await autenticar("aluno");
  const raiz = await criarCategoria(admin, { nome: "Listas", ordem: 1 });
  assert.equal(raiz.status, 201);
  assert.equal((await criarCategoria(admin, { nome: "Listas" })).status, 409);
  const filha = await criarCategoria(admin, {
    nome: "Matematica",
    categoriaPaiId: raiz.body.categoria.id,
    descricao: "Listas de matematica",
    ordem: 2
  });
  assert.equal(filha.status, 201);
  assert.equal((await criarClassificacao(admin, "/api/disciplinas", "Matematica")).status, 201);
  assert.equal((await criarClassificacao(admin, "/api/concursos", "EFOMM")).status, 201);

  const publica = await aluno.agente.get("/api/estrutura-acervo");
  assert.equal(publica.status, 200);
  assert.equal(publica.body.estrutura.categorias.length, 1);
  assert.equal(publica.body.estrutura.categorias[0].filhas[0].nome, "Matematica");
  assert.equal(publica.body.estrutura.disciplinas[0].nome, "Matematica");
  assert.equal(publica.body.estrutura.concursos[0].nome, "EFOMM");
});

test("hierarquia recusa pai proprio, ciclos, pai inexistente e desativacao invalida", async function testarHierarquia() {
  const admin = await autenticar("admin");
  const raiz = (await criarCategoria(admin, { nome: "Raiz" })).body.categoria;
  const filha = (await criarCategoria(admin, {
    nome: "Filha",
    categoriaPaiId: raiz.id
  })).body.categoria;
  const neta = (await criarCategoria(admin, {
    nome: "Neta",
    categoriaPaiId: filha.id
  })).body.categoria;

  const paiProprio = await admin.agente
    .patch("/api/categorias/" + filha.id)
    .set("X-CSRF-Token", admin.csrf)
    .send({ categoriaPaiId: filha.id });
  assert.equal(paiProprio.status, 409);
  assert.equal(paiProprio.body.erro.codigo, "HIERARQUIA_INVALIDA");

  const ciclo = await admin.agente
    .patch("/api/categorias/" + raiz.id)
    .set("X-CSRF-Token", admin.csrf)
    .send({ categoriaPaiId: neta.id });
  assert.equal(ciclo.status, 409);
  assert.equal(ciclo.body.erro.codigo, "CICLO_DE_CATEGORIA");

  const inexistente = await admin.agente
    .patch("/api/categorias/" + filha.id)
    .set("X-CSRF-Token", admin.csrf)
    .send({ categoriaPaiId: 999999 });
  assert.equal(inexistente.status, 404);

  const desativarComFilha = await admin.agente
    .patch("/api/categorias/" + raiz.id + "/ativo")
    .set("X-CSRF-Token", admin.csrf)
    .send({ ativo: false });
  assert.equal(desativarComFilha.status, 409);
  assert.equal(desativarComFilha.body.erro.codigo, "CATEGORIA_POSSUI_FILHAS_ATIVAS");
});

test("registro inativo so pode ser reativado e nao aparece na estrutura publica", async function testarInativos() {
  const admin = await autenticar("admin");
  const aluno = await autenticar("aluno");
  const categoria = (await criarCategoria(admin, { nome: "Temporaria" })).body.categoria;
  const desativada = await admin.agente
    .patch("/api/categorias/" + categoria.id + "/ativo")
    .set("X-CSRF-Token", admin.csrf)
    .send({ ativo: false });
  assert.equal(desativada.status, 200);

  const edicao = await admin.agente
    .patch("/api/categorias/" + categoria.id)
    .set("X-CSRF-Token", admin.csrf)
    .send({ nome: "Nao deve mudar" });
  assert.equal(edicao.status, 409);
  assert.equal(edicao.body.erro.codigo, "CATEGORIA_INATIVA");

  const publica = await aluno.agente.get("/api/estrutura-acervo");
  assert.equal(publica.body.estrutura.categorias.length, 0);

  const reativada = await admin.agente
    .patch("/api/categorias/" + categoria.id + "/ativo")
    .set("X-CSRF-Token", admin.csrf)
    .send({ ativo: true });
  assert.equal(reativada.status, 200);
});

test("disciplinas e concursos suportam administracao, duplicidade e estado", async function testarCatalogos() {
  const admin = await autenticar("admin");
  const disciplina = await criarClassificacao(admin, "/api/disciplinas", "Fisica");
  assert.equal(disciplina.status, 201);
  const duplicada = await criarClassificacao(admin, "/api/disciplinas", "Fisica");
  assert.equal(duplicada.status, 409);

  const concurso = await criarClassificacao(admin, "/api/concursos", "AFA");
  const editado = await admin.agente
    .patch("/api/concursos/" + concurso.body.concurso.id)
    .set("X-CSRF-Token", admin.csrf)
    .send({ nome: "AFA 2027", descricao: "Concurso atualizado" });
  assert.equal(editado.status, 200);
  assert.equal(editado.body.concurso.nome, "AFA 2027");

  const inativo = await admin.agente
    .patch("/api/disciplinas/" + disciplina.body.disciplina.id + "/ativo")
    .set("X-CSRF-Token", admin.csrf)
    .send({ ativo: false });
  assert.equal(inativo.status, 200);
  const edicaoInativa = await admin.agente
    .patch("/api/disciplinas/" + disciplina.body.disciplina.id)
    .set("X-CSRF-Token", admin.csrf)
    .send({ nome: "Fisica II" });
  assert.equal(edicaoInativa.status, 409);
});

test("aluno e professor nao executam administracao e mutacoes exigem CSRF", async function testarAutorizacao() {
  const admin = await autenticar("admin");
  const professor = await autenticar("professor");
  const aluno = await autenticar("aluno");

  const semCsrf = await admin.agente.post("/api/categorias").send({ nome: "Bloqueada" });
  assert.equal(semCsrf.status, 403);
  assert.equal(semCsrf.body.erro.codigo, "CSRF_INVALIDO");

  const professorCriando = await criarCategoria(professor, { nome: "Negada" });
  assert.equal(professorCriando.status, 403);
  assert.equal((await professor.agente.get("/api/categorias")).status, 403);
  assert.equal((await professor.agente.get("/api/permissoes")).status, 403);
  const alunoCriando = await criarClassificacao(aluno, "/api/concursos", "Negado");
  assert.equal(alunoCriando.status, 403);
  const professorConcedendo = await professor.agente
    .post("/api/permissoes")
    .set("X-CSRF-Token", professor.csrf)
    .send({ professorId: professor.usuario.id, categoriaId: 1 });
  assert.equal(professorConcedendo.status, 403);
});

test("todas as rotas mutaveis da fase 3 recusam CSRF ausente", async function testarCsrfCompleto() {
  const admin = await autenticar("admin");
  const requisicoes = [
    admin.agente.post("/api/categorias").send({ nome: "Categoria" }),
    admin.agente.patch("/api/categorias/1").send({ nome: "Categoria" }),
    admin.agente.patch("/api/categorias/1/ativo").send({ ativo: false }),
    admin.agente.post("/api/disciplinas").send({ nome: "Disciplina" }),
    admin.agente.patch("/api/disciplinas/1").send({ nome: "Disciplina" }),
    admin.agente.patch("/api/disciplinas/1/ativo").send({ ativo: false }),
    admin.agente.post("/api/concursos").send({ nome: "Concurso" }),
    admin.agente.patch("/api/concursos/1").send({ nome: "Concurso" }),
    admin.agente.patch("/api/concursos/1/ativo").send({ ativo: false }),
    admin.agente.post("/api/permissoes").send({ professorId: 1, categoriaId: 1 }),
    admin.agente.delete("/api/permissoes/1")
  ];
  const respostas = await Promise.all(requisicoes);

  respostas.forEach(function validarResposta(resposta) {
    assert.equal(resposta.status, 403);
    assert.equal(resposta.body.erro.codigo, "CSRF_INVALIDO");
  });
});

test("validacao bloqueia mass assignment, IDs manipulados e SQL injection", async function testarEntradasHostis() {
  const admin = await autenticar("admin");
  const massAssignment = await criarCategoria(admin, {
    nome: "Segura",
    ativo: false,
    usuarioId: usuarios.aluno.id
  });
  assert.equal(massAssignment.status, 400);
  assert.equal(massAssignment.body.erro.codigo, "CAMPO_NAO_PERMITIDO");

  const injecaoNoId = await admin.agente
    .patch("/api/categorias/1%20OR%201=1")
    .set("X-CSRF-Token", admin.csrf)
    .send({ nome: "Injecao" });
  assert.equal(injecaoNoId.status, 400);

  const nomeSql = await criarCategoria(admin, { nome: "Teste'); DROP TABLE usuarios; --" });
  assert.equal(nomeSql.status, 201);
  const [tabela] = await pool.execute("SELECT COUNT(*) AS quantidade FROM usuarios");
  assert.equal(Number(tabela[0].quantidade), 4);
});

test("admin concede, consulta, revoga e reconcede permissao", async function testarPermissao() {
  const admin = await autenticar("admin");
  const professor = await autenticar("professor");
  const categoria = (await criarCategoria(admin, { nome: "Area autorizada" })).body.categoria;
  const concessao = await admin.agente
    .post("/api/permissoes")
    .set("X-CSRF-Token", admin.csrf)
    .send({ professorId: professor.usuario.id, categoriaId: categoria.id });
  assert.equal(concessao.status, 201);
  assert.equal(concessao.body.permissao.ativa, true);
  const duplicada = await admin.agente
    .post("/api/permissoes")
    .set("X-CSRF-Token", admin.csrf)
    .send({ professorId: professor.usuario.id, categoriaId: categoria.id });
  assert.equal(duplicada.status, 409);

  const minhas = await professor.agente.get("/api/permissoes/minhas");
  assert.equal(minhas.status, 200);
  assert.equal(minhas.body.permissoes.length, 1);
  assert.equal(minhas.body.permissoes[0].categoria.id, categoria.id);

  const todas = await admin.agente.get("/api/permissoes");
  assert.equal(todas.status, 200);
  assert.equal(todas.body.permissoes.length, 1);

  const revogada = await admin.agente
    .delete("/api/permissoes/" + concessao.body.permissao.id)
    .set("X-CSRF-Token", admin.csrf);
  assert.equal(revogada.status, 200);
  assert.equal(revogada.body.permissao.ativa, false);
  assert.equal((await professor.agente.get("/api/permissoes/minhas")).body.permissoes.length, 0);

  const reconcessao = await admin.agente
    .post("/api/permissoes")
    .set("X-CSRF-Token", admin.csrf)
    .send({ professorId: professor.usuario.id, categoriaId: categoria.id });
  assert.equal(reconcessao.status, 201);
  assert.equal(reconcessao.body.permissao.id, concessao.body.permissao.id);
});

test("permissao valida professor, categoria, auto concessao e mass assignment", async function testarPermissaoInvalida() {
  const admin = await autenticar("admin");
  const categoria = (await criarCategoria(admin, { nome: "Area valida" })).body.categoria;

  const aluno = await admin.agente
    .post("/api/permissoes")
    .set("X-CSRF-Token", admin.csrf)
    .send({ professorId: usuarios.aluno.id, categoriaId: categoria.id });
  assert.equal(aluno.status, 409);
  assert.equal(aluno.body.erro.codigo, "PROFESSOR_INVALIDO");

  const autoConcessao = await admin.agente
    .post("/api/permissoes")
    .set("X-CSRF-Token", admin.csrf)
    .send({ professorId: usuarios.admin.id, categoriaId: categoria.id });
  assert.equal(autoConcessao.status, 409);
  assert.equal(autoConcessao.body.erro.codigo, "AUTO_CONCESSAO_NEGADA");

  const massAssignment = await admin.agente
    .post("/api/permissoes")
    .set("X-CSRF-Token", admin.csrf)
    .send({
      professorId: usuarios.professor.id,
      categoriaId: categoria.id,
      concedidaPorUsuarioId: usuarios.aluno.id
    });
  assert.equal(massAssignment.status, 400);

  const categoriaInexistente = await admin.agente
    .post("/api/permissoes")
    .set("X-CSRF-Token", admin.csrf)
    .send({ professorId: usuarios.professor.id, categoriaId: 999999 });
  assert.equal(categoriaInexistente.status, 404);

  const permissaoInexistente = await admin.agente
    .delete("/api/permissoes/999999")
    .set("X-CSRF-Token", admin.csrf);
  assert.equal(permissaoInexistente.status, 404);

  await admin.agente
    .patch("/api/categorias/" + categoria.id + "/ativo")
    .set("X-CSRF-Token", admin.csrf)
    .send({ ativo: false });
  const categoriaInativa = await admin.agente
    .post("/api/permissoes")
    .set("X-CSRF-Token", admin.csrf)
    .send({ professorId: usuarios.professor.id, categoriaId: categoria.id });
  assert.equal(categoriaInativa.status, 409);
  assert.equal(categoriaInativa.body.erro.codigo, "CATEGORIA_INATIVA");
});

test("professor ve somente as proprias permissoes e aluno nao acessa a consulta", async function testarIdor() {
  const admin = await autenticar("admin");
  const professor = await autenticar("professor");
  const professorDois = await autenticar("professorDois");
  const aluno = await autenticar("aluno");
  const categoriaUm = (await criarCategoria(admin, { nome: "Area um" })).body.categoria;
  const categoriaDois = (await criarCategoria(admin, { nome: "Area dois" })).body.categoria;

  await admin.agente.post("/api/permissoes").set("X-CSRF-Token", admin.csrf).send({
    professorId: professor.usuario.id,
    categoriaId: categoriaUm.id
  });
  await admin.agente.post("/api/permissoes").set("X-CSRF-Token", admin.csrf).send({
    professorId: professorDois.usuario.id,
    categoriaId: categoriaDois.id
  });

  const tentativaIdor = await professor.agente.get(
    "/api/permissoes/minhas?professorId=" + professorDois.usuario.id
  );
  assert.equal(tentativaIdor.status, 200);
  assert.equal(tentativaIdor.body.permissoes.length, 1);
  assert.equal(tentativaIdor.body.permissoes[0].categoria.id, categoriaUm.id);
  assert.equal((await aluno.agente.get("/api/permissoes/minhas")).status, 403);
});
