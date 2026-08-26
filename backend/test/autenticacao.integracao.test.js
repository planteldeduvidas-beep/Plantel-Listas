const test = require("node:test");
const assert = require("node:assert/strict");
const pino = require("pino");
const request = require("supertest");
const criarAplicacao = require("../src/app");
const { obterConfiguracao } = require("../src/shared/config/ambiente");
const { criarPool } = require("../src/shared/database/conexao");
const { criarEmailProviderFake } = require("../src/shared/providers/emailProvider");
const { gerarHashDoToken } = require("../src/shared/utils/tokens");
const { gerarTokenCsrf } = require("../src/shared/middlewares/protegerCsrf");
const executarBootstrapAdmin = require("../scripts/bootstrapAdmin");

const configuracaoBase = obterConfiguracao();
const nomeBancoTeste = process.env.DB_TEST_NAME
  || configuracaoBase.banco.nome + "_test";
const configuracaoTeste = Object.assign({}, configuracaoBase, {
  ambiente: "test",
  confiarProxy: false,
  nivelDeLog: "silent",
  banco: Object.assign({}, configuracaoBase.banco, { nome: nomeBancoTeste }),
  seguranca: Object.assign({}, configuracaoBase.seguranca, {
    limiteAutenticacao: 20,
    limiteRecuperacao: 20
  })
});
const pool = criarPool(configuracaoTeste.banco);
const logger = pino({ level: "silent" });

let aplicacao;
let emailProvider;

async function limparBanco() {
  await pool.execute("DELETE FROM recuperacoes_senha");
  await pool.execute("DELETE FROM sessoes");
  await pool.execute("DELETE FROM usuarios");
}

function criarApp(configuracaoInformada) {
  emailProvider = criarEmailProviderFake();
  aplicacao = criarAplicacao(
    configuracaoInformada || configuracaoTeste,
    logger,
    { pool: pool, emailProvider: emailProvider }
  );
  return aplicacao;
}

async function obterCsrf(agente) {
  const resposta = await agente.get("/api/autenticacao/csrf");
  assert.equal(resposta.status, 200);
  return resposta.body.csrfToken;
}

async function cadastrar(agente, email, senha, camposAdicionais) {
  const csrf = await obterCsrf(agente);
  const corpo = Object.assign({ email: email, senha: senha }, camposAdicionais || {});
  return agente
    .post("/api/autenticacao/cadastro")
    .set("X-CSRF-Token", csrf)
    .send(corpo);
}

async function entrar(agente, email, senha) {
  const csrf = await obterCsrf(agente);
  return agente
    .post("/api/autenticacao/login")
    .set("X-CSRF-Token", csrf)
    .send({ email: email, senha: senha });
}

async function solicitarRecuperacao(agente, email) {
  const csrf = await obterCsrf(agente);
  return agente
    .post("/api/autenticacao/recuperacao-senha/solicitar")
    .set("X-CSRF-Token", csrf)
    .send({ email: email });
}

function extrairTokenDeRecuperacao() {
  const mensagens = emailProvider.obterMensagens();
  assert.equal(mensagens.length, 1);
  const url = new URL(mensagens[0].link);
  return url.searchParams.get("tokenRecuperacao");
}

test.beforeEach(async function prepararTeste() {
  await limparBanco();
  criarApp();
});

test.after(async function encerrarPool() {
  await pool.end();
});

test("cadastra somente aluno com senha Argon2id", async function testarCadastro() {
  const agente = request.agent(aplicacao);
  const resposta = await cadastrar(
    agente,
    "Aluno@Example.com",
    "Senha-forte-123"
  );

  assert.equal(resposta.status, 201);
  assert.equal(resposta.body.usuario.email, "aluno@example.com");
  assert.equal(resposta.body.usuario.papel, "aluno");
  assert.equal(JSON.stringify(resposta.body).includes("Senha-forte-123"), false);

  const [usuarios] = await pool.execute(
    "SELECT senha_hash, papel FROM usuarios WHERE email = ?",
    ["aluno@example.com"]
  );
  assert.match(usuarios[0].senha_hash, /^\$argon2id\$/);
  assert.equal(usuarios[0].senha_hash.includes("Senha-forte-123"), false);
  assert.equal(usuarios[0].papel, "aluno");
});

test("rejeita cadastro invalido, duplicado e mass assignment", async function testarCadastroInvalido() {
  const agente = request.agent(aplicacao);
  const invalido = await cadastrar(agente, "email-invalido", "curta");
  assert.equal(invalido.status, 400);

  const primeiro = await cadastrar(agente, "duplicado@example.com", "Senha-forte-123");
  assert.equal(primeiro.status, 201);
  const duplicado = await cadastrar(agente, "DUPLICADO@example.com", "Outra-senha-123");
  assert.equal(duplicado.status, 409);

  const escalacao = await cadastrar(
    agente,
    "admin-falso@example.com",
    "Senha-forte-123",
    { papel: "admin", ativo: true, usuarioId: 1 }
  );
  assert.equal(escalacao.status, 400);
  assert.equal(escalacao.body.erro.codigo, "CAMPOS_NAO_PERMITIDOS");
  const [registros] = await pool.execute(
    "SELECT COUNT(*) AS quantidade FROM usuarios WHERE email = ?",
    ["admin-falso@example.com"]
  );
  assert.equal(Number(registros[0].quantidade), 0);
});

test("login cria cookie seguro e banco guarda somente hash do token", async function testarLogin() {
  const agente = request.agent(aplicacao);
  await cadastrar(agente, "login@example.com", "Senha-forte-123");
  const resposta = await entrar(agente, "login@example.com", "Senha-forte-123");

  assert.equal(resposta.status, 200);
  assert.equal(resposta.body.usuario.papel, "aluno");
  assert.equal(Object.hasOwn(resposta.body, "token"), false);
  const cookies = resposta.headers["set-cookie"];
  const cookieSessao = cookies.find(function localizarCookie(cookie) {
    return cookie.startsWith(configuracaoTeste.seguranca.nomeCookieSessao + "=");
  });
  assert.match(cookieSessao, /HttpOnly/i);
  assert.match(cookieSessao, /SameSite=Lax/i);
  const token = cookieSessao.split(";")[0].split("=")[1];
  const [sessoes] = await pool.execute("SELECT token_hash FROM sessoes LIMIT 1");
  assert.equal(sessoes[0].token_hash, gerarHashDoToken(token));
  assert.notEqual(sessoes[0].token_hash, token);

  const atual = await agente.get("/api/autenticacao/me");
  assert.equal(atual.status, 200);
  assert.equal(atual.headers["cache-control"], "no-store, max-age=0");
});

test("cookie de sessao usa Secure em producao", async function testarCookieProducao() {
  const configuracaoProducao = Object.assign({}, configuracaoTeste, { ambiente: "production" });
  criarApp(configuracaoProducao);
  const tokenCsrf = gerarTokenCsrf(configuracaoProducao.seguranca.csrfSecret);
  await request(aplicacao)
    .post("/api/autenticacao/cadastro")
    .set("Cookie", configuracaoProducao.seguranca.nomeCookieCsrf + "=" + tokenCsrf)
    .set("X-CSRF-Token", tokenCsrf)
    .send({ email: "secure@example.com", senha: "Senha-forte-123" });
  const resposta = await request(aplicacao)
    .post("/api/autenticacao/login")
    .set("Cookie", configuracaoProducao.seguranca.nomeCookieCsrf + "=" + tokenCsrf)
    .set("X-CSRF-Token", tokenCsrf)
    .send({ email: "secure@example.com", senha: "Senha-forte-123" });
  const cookieSessao = resposta.headers["set-cookie"].find(function localizarCookie(cookie) {
    return cookie.startsWith(configuracaoTeste.seguranca.nomeCookieSessao + "=");
  });
  assert.match(cookieSessao, /Secure/i);
});

test("login invalido, inexistente, desativado e SQL Injection usam resposta segura", async function testarLoginNegado() {
  const agente = request.agent(aplicacao);
  await cadastrar(agente, "negado@example.com", "Senha-forte-123");

  const senhaErrada = await entrar(agente, "negado@example.com", "Senha-errada-123");
  const inexistente = await entrar(agente, "inexistente@example.com", "Senha-errada-123");
  const injecao = await entrar(agente, "x'or'1'='1@example.com", "Senha-errada-123");
  assert.equal(senhaErrada.status, 401);
  assert.equal(inexistente.status, 401);
  assert.equal(injecao.status, 401);
  assert.deepEqual(senhaErrada.body, inexistente.body);

  await pool.execute("UPDATE usuarios SET ativo = 0 WHERE email = ?", ["negado@example.com"]);
  const desativado = await entrar(agente, "negado@example.com", "Senha-forte-123");
  assert.equal(desativado.status, 401);
  assert.equal(desativado.body.erro.codigo, "CREDENCIAIS_INVALIDAS");
});

test("sessao adulterada e expirada sao recusadas", async function testarSessoesInvalidas() {
  const agente = request.agent(aplicacao);
  await cadastrar(agente, "sessao@example.com", "Senha-forte-123");
  await entrar(agente, "sessao@example.com", "Senha-forte-123");
  await pool.execute("UPDATE sessoes SET expira_em = DATE_SUB(NOW(3), INTERVAL 1 SECOND)");
  const expirada = await agente.get("/api/autenticacao/me");
  assert.equal(expirada.status, 401);

  const adulterada = await request(aplicacao)
    .get("/api/autenticacao/me")
    .set("Cookie", configuracaoTeste.seguranca.nomeCookieSessao + "=token-adulterado");
  assert.equal(adulterada.status, 401);
});

test("logout revoga a sessao", async function testarLogout() {
  const agente = request.agent(aplicacao);
  await cadastrar(agente, "logout@example.com", "Senha-forte-123");
  await entrar(agente, "logout@example.com", "Senha-forte-123");
  const csrf = await obterCsrf(agente);
  const resposta = await agente
    .post("/api/autenticacao/logout")
    .set("X-CSRF-Token", csrf);
  assert.equal(resposta.status, 204);
  const atual = await agente.get("/api/autenticacao/me");
  assert.equal(atual.status, 401);
  const [sessoes] = await pool.execute("SELECT revogada_em FROM sessoes LIMIT 1");
  assert.ok(sessoes[0].revogada_em);
});

test("CSRF ausente ou adulterado bloqueia operacoes de estado", async function testarCsrf() {
  const agente = request.agent(aplicacao);
  const semToken = await agente
    .post("/api/autenticacao/login")
    .send({ email: "csrf@example.com", senha: "Senha-forte-123" });
  assert.equal(semToken.status, 403);

  await obterCsrf(agente);
  const adulterado = await agente
    .post("/api/autenticacao/login")
    .set("X-CSRF-Token", "token.adulterado")
    .send({ email: "csrf@example.com", senha: "Senha-forte-123" });
  assert.equal(adulterado.status, 403);
  assert.equal(adulterado.body.erro.codigo, "CSRF_INVALIDO");
});

test("rate limit bloqueia brute force", async function testarRateLimit() {
  const configuracaoLimitada = Object.assign({}, configuracaoTeste, {
    seguranca: Object.assign({}, configuracaoTeste.seguranca, {
      limiteAutenticacao: 3
    })
  });
  criarApp(configuracaoLimitada);
  const agente = request.agent(aplicacao);
  const csrf = await obterCsrf(agente);
  let resposta;

  for (let tentativa = 0; tentativa < 4; tentativa += 1) {
    resposta = await agente
      .post("/api/autenticacao/login")
      .set("X-CSRF-Token", csrf)
      .send({ email: "brute@example.com", senha: "Senha-errada-123" });
  }

  assert.equal(resposta.status, 429);
  assert.equal(resposta.body.erro.codigo, "LIMITE_AUTENTICACAO");
  assert.ok(resposta.headers["ratelimit-policy"]);
});

test("aluno e professor nao acessam operacoes de admin", async function testarAutorizacao() {
  const aluno = request.agent(aplicacao);
  await cadastrar(aluno, "aluno-role@example.com", "Senha-forte-123");
  await entrar(aluno, "aluno-role@example.com", "Senha-forte-123");
  const respostaAluno = await aluno.get("/api/usuarios");
  assert.equal(respostaAluno.status, 403);
  const csrfAluno = await obterCsrf(aluno);
  const escalacaoAluno = await aluno
    .patch("/api/usuarios/1/papel")
    .set("X-CSRF-Token", csrfAluno)
    .send({ papel: "admin" });
  assert.equal(escalacaoAluno.status, 403);

  await pool.execute(
    "UPDATE usuarios SET papel = ? WHERE email = ?",
    ["professor", "aluno-role@example.com"]
  );
  const professor = request.agent(aplicacao);
  await entrar(professor, "aluno-role@example.com", "Senha-forte-123");
  const respostaProfessor = await professor.get("/api/usuarios");
  assert.equal(respostaProfessor.status, 403);
  const csrfProfessor = await obterCsrf(professor);
  const escalacaoProfessor = await professor
    .patch("/api/usuarios/1/papel")
    .set("X-CSRF-Token", csrfProfessor)
    .send({ papel: "admin" });
  assert.equal(escalacaoProfessor.status, 403);
});

test("bootstrap cria somente o primeiro admin", async function testarBootstrap() {
  const admin = await executarBootstrapAdmin(
    pool,
    "primeiro-admin@example.com",
    "Senha-admin-forte-123"
  );
  assert.equal(admin.papel, "admin");
  assert.match(admin.senhaHash, /^\$argon2id\$/);
  await assert.rejects(
    executarBootstrapAdmin(pool, "segundo-admin@example.com", "Senha-admin-forte-456"),
    /ja existe um admin/
  );
});

test("admin altera papel e estado sem aceitar manipulacao de identidade", async function testarGestaoAdmin() {
  await executarBootstrapAdmin(pool, "admin@example.com", "Senha-admin-forte-123");
  const aluno = request.agent(aplicacao);
  const cadastro = await cadastrar(aluno, "gerenciado@example.com", "Senha-forte-123");
  const alvoId = cadastro.body.usuario.id;
  const admin = request.agent(aplicacao);
  await entrar(admin, "admin@example.com", "Senha-admin-forte-123");
  const csrf = await obterCsrf(admin);
  const listagem = await admin.get("/api/usuarios");
  assert.equal(listagem.status, 200);
  assert.equal(JSON.stringify(listagem.body).includes("senhaHash"), false);
  assert.equal(JSON.stringify(listagem.body).includes("senha_hash"), false);

  const manipulada = await admin
    .patch("/api/usuarios/" + alvoId + "/papel")
    .set("X-CSRF-Token", csrf)
    .send({ papel: "admin", usuarioId: 1 });
  assert.equal(manipulada.status, 400);

  const promovida = await admin
    .patch("/api/usuarios/" + alvoId + "/papel")
    .set("X-CSRF-Token", csrf)
    .send({ papel: "professor" });
  assert.equal(promovida.status, 200);
  assert.equal(promovida.body.usuario.papel, "professor");

  const sessaoDoProfessor = request.agent(aplicacao);
  const loginProfessor = await entrar(
    sessaoDoProfessor,
    "gerenciado@example.com",
    "Senha-forte-123"
  );
  assert.equal(loginProfessor.status, 200);

  const desativada = await admin
    .patch("/api/usuarios/" + alvoId + "/ativo")
    .set("X-CSRF-Token", csrf)
    .send({ ativo: false });
  assert.equal(desativada.status, 200);
  assert.equal(desativada.body.usuario.ativo, false);
  const acessoAposDesativacao = await sessaoDoProfessor.get("/api/autenticacao/me");
  assert.equal(acessoAposDesativacao.status, 401);
});

test("recuperacao e neutra, de uso unico e revoga sessoes", async function testarRecuperacao() {
  const agente = request.agent(aplicacao);
  await cadastrar(agente, "recuperacao@example.com", "Senha-antiga-123");
  await entrar(agente, "recuperacao@example.com", "Senha-antiga-123");

  const existente = await solicitarRecuperacao(agente, "recuperacao@example.com");
  const mensagemExistente = existente.body.mensagem;
  assert.equal(Object.hasOwn(existente.body, "token"), false);
  const token = extrairTokenDeRecuperacao();
  const [recuperacoes] = await pool.execute(
    "SELECT token_hash FROM recuperacoes_senha WHERE usada_em IS NULL LIMIT 1"
  );
  assert.equal(recuperacoes[0].token_hash, gerarHashDoToken(token));
  assert.notEqual(recuperacoes[0].token_hash, token);
  const csrf = await obterCsrf(agente);
  const redefinida = await agente
    .post("/api/autenticacao/recuperacao-senha/redefinir")
    .set("X-CSRF-Token", csrf)
    .send({ token: token, novaSenha: "Senha-nova-forte-456" });
  assert.equal(redefinida.status, 200);

  const sessaoAntiga = await agente.get("/api/autenticacao/me");
  assert.equal(sessaoAntiga.status, 401);
  const senhaAntiga = await entrar(request.agent(aplicacao), "recuperacao@example.com", "Senha-antiga-123");
  assert.equal(senhaAntiga.status, 401);
  const senhaNova = await entrar(request.agent(aplicacao), "recuperacao@example.com", "Senha-nova-forte-456");
  assert.equal(senhaNova.status, 200);

  const reutilizadaAgente = request.agent(aplicacao);
  const csrfReutilizado = await obterCsrf(reutilizadaAgente);
  const reutilizada = await reutilizadaAgente
    .post("/api/autenticacao/recuperacao-senha/redefinir")
    .set("X-CSRF-Token", csrfReutilizado)
    .send({ token: token, novaSenha: "Outra-senha-forte-789" });
  assert.equal(reutilizada.status, 400);

  emailProvider.limpar();
  const inexistente = await solicitarRecuperacao(
    request.agent(aplicacao),
    "nao-existe@example.com"
  );
  assert.equal(inexistente.body.mensagem, mensagemExistente);
  assert.equal(emailProvider.obterMensagens().length, 0);
});

test("token de recuperacao expirado e recusado", async function testarTokenExpirado() {
  const agente = request.agent(aplicacao);
  await cadastrar(agente, "expirado@example.com", "Senha-antiga-123");
  await solicitarRecuperacao(agente, "expirado@example.com");
  const token = extrairTokenDeRecuperacao();
  await pool.execute(
    "UPDATE recuperacoes_senha SET expira_em = DATE_SUB(NOW(3), INTERVAL 1 SECOND)"
  );
  const csrf = await obterCsrf(agente);
  const resposta = await agente
    .post("/api/autenticacao/recuperacao-senha/redefinir")
    .set("X-CSRF-Token", csrf)
    .send({ token: token, novaSenha: "Senha-nova-forte-456" });
  assert.equal(resposta.status, 400);
  assert.equal(resposta.body.erro.codigo, "TOKEN_RECUPERACAO_INVALIDO");
});
