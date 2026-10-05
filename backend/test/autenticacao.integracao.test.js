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
  defesa: {...configuracaoBase.defesa, chaveEvidencia: require("node:crypto").randomBytes(32).toString("hex")},
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
  await pool.execute("DELETE FROM cadastros_publicos_pendentes");
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
  const corpo = Object.assign({ nome: "Aluno Teste", email: email, senha: senha }, camposAdicionais || {});
  const resposta = await agente
    .post("/api/autenticacao/cadastro")
    .set("X-CSRF-Token", csrf)
    .send(corpo);
  // Estes cenarios exercitam outros envios. O envio automatico do cadastro e
  // validado em teste proprio abaixo, sem contaminar a contagem de recuperacao.
  if (resposta.status === 201 && resposta.body.confirmacaoEmailEnviada) {
    assert.equal((await confirmarCadastro(agente, tokenEmailMaisRecente())).status, 200);
    const u = await require("../src/modules/usuarios/usuarioRepository")(pool).buscarPorEmail(corpo.email.trim().toLowerCase());
    resposta.body.usuario = require("../src/modules/usuarios/usuarioPublico")(u);
  }
  emailProvider.limpar();
  return resposta;
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

function tokenEmailMaisRecente() {
  const mensagens = emailProvider.obterMensagens().filter(m => m.tipo === "confirmacaoEmail");
  return new URL(mensagens.at(-1).link).searchParams.get("tokenEmail");
}

async function confirmarCadastro(agente, token) {
  const csrf = await obterCsrf(agente);
  return agente.post("/api/autenticacao/cadastro/email/confirmar").set("X-CSRF-Token", csrf).send({ token });
}
async function reenviarCadastro(agente, emailAtual, email = emailAtual, senha = "Senha-forte-123") {
  const csrf = await obterCsrf(agente);
  return agente.post("/api/autenticacao/cadastro/email/solicitar").set("X-CSRF-Token", csrf).send({ emailAtual, email, senha });
}
async function liberarCooldown(email) {
  await pool.execute("UPDATE cadastros_publicos_pendentes SET enviado_em=DATE_SUB(CURRENT_TIMESTAMP(3),INTERVAL 2 MINUTE) WHERE email=?",[email]);
}

test("novo cadastro exige confirmacao antes do login e falha SMTP preserva reenvio", async () => {
  const agente = request.agent(aplicacao);
  const csrf = await obterCsrf(agente);
  const cadastro = await agente.post("/api/autenticacao/cadastro").set("X-CSRF-Token", csrf)
    .send({nome:"Aluno novo",email:"cadastro-confirmacao@outlook.com",senha:"Senha-forte-123"});
  assert.equal(cadastro.status, 201);
  assert.equal(cadastro.body.confirmacaoEmailEnviada, true);
  assert.match(cadastro.body.mensagem, /Spam ou Lixo eletrônico/);
  assert.equal(cadastro.body.confirmacaoPendente, true);
  assert.equal(emailProvider.obterMensagens().length, 1);
  assert.equal(emailProvider.obterMensagens()[0].destinatario, "cadastro-confirmacao@outlook.com");
  const token = tokenEmailMaisRecente();
  const negado = await entrar(agente,"cadastro-confirmacao@outlook.com","Senha-forte-123");
  assert.equal(negado.status,403);
  assert.equal(negado.body.erro.codigo,"EMAIL_NAO_CONFIRMADO");
  assert.equal(negado.headers["set-cookie"],undefined);
  assert.equal((await agente.get("/api/autenticacao/me")).status,401);
  assert.equal((await confirmarCadastro(agente,token)).status,200);
  assert.equal((await confirmarCadastro(agente,token)).status,400);
  assert.equal((await entrar(agente,"cadastro-confirmacao@outlook.com","Senha-forte-123")).status,200);
  const enviar = emailProvider.enviarConfirmacaoEmail;
  emailProvider.enviarConfirmacaoEmail = async () => { throw new Error("SMTP indisponivel"); };
  const semEnvio = await agente.post("/api/autenticacao/cadastro").set("X-CSRF-Token",csrf)
    .send({nome:"Aluno preservado",email:"cadastro-preservado@proton.me",senha:"Senha-forte-123"});
  emailProvider.enviarConfirmacaoEmail = enviar;
  assert.equal(semEnvio.status,201);
  assert.equal(semEnvio.body.confirmacaoEmailEnviada,false);
  assert.equal((await entrar(agente,"cadastro-preservado@proton.me","Senha-forte-123")).status,403);
  assert.equal((await reenviarCadastro(agente,"cadastro-preservado@proton.me")).status,429);
  await liberarCooldown("cadastro-preservado@proton.me");
  assert.equal((await reenviarCadastro(agente,"cadastro-preservado@proton.me")).status,200);
  assert.equal((await confirmarCadastro(agente,tokenEmailMaisRecente())).status,200);
  assert.equal((await entrar(agente,"cadastro-preservado@proton.me","Senha-forte-123")).status,200);
});

test("cadastro pendente corrige email ao confirmar, exige senha e rejeita expiracao", async () => {
  const agente = request.agent(aplicacao);
  const email = "cadastro-errado@example.com", novo = "cadastro-correto@gmail.com";
  const csrf = await obterCsrf(agente);
  assert.equal((await agente.post("/api/autenticacao/cadastro").set("X-CSRF-Token",csrf).send({nome:"Aluno Novo",email,senha:"Senha-forte-123"})).status,201);
  const antigo = tokenEmailMaisRecente();
  assert.equal((await reenviarCadastro(agente,email,novo,"Senha-incorreta-123")).status,401);
  await liberarCooldown(email);
  assert.equal((await reenviarCadastro(agente,email,novo)).status,200);
  const token = tokenEmailMaisRecente();
  const repo = require("../src/modules/usuarios/usuarioRepository")(pool);
  assert.equal(await repo.buscarPorEmail(email),null);
  assert.equal(await repo.buscarPorEmail(novo),null);
  assert.equal((await confirmarCadastro(agente,antigo)).status,400);
  assert.equal((await confirmarCadastro(agente,"x".repeat(43))).status,400);
  await pool.execute("UPDATE cadastros_publicos_pendentes SET expira_em=DATE_SUB(NOW(),INTERVAL 1 HOUR) WHERE token_hash=?",[gerarHashDoToken(token)]);
  assert.equal((await confirmarCadastro(agente,token)).status,400);
  await liberarCooldown(email);
  assert.equal((await reenviarCadastro(agente,email,novo)).status,200);
  const valido = tokenEmailMaisRecente();
  const repoFalho = require("../src/modules/autenticacao/cadastroPendenteRepository")(pool,repo,{registrar:async()=>{throw new Error("Auditoria indisponivel");}});
  await assert.rejects(repoFalho.confirmar(gerarHashDoToken(valido)),/Auditoria indisponivel/);
  assert.equal(await repo.buscarPorEmail(novo),null);
  assert.equal((await entrar(agente,email,"Senha-forte-123")).status,403);
  assert.equal((await confirmarCadastro(agente,valido)).status,200);
  assert.ok((await repo.buscarPorEmail(novo)).id);
  assert.equal((await entrar(agente,novo,"Senha-forte-123")).status,200);
  assert.equal((await confirmarCadastro(agente,valido)).status,400);
});

test("recuperar senha nao libera cadastro pendente e token de conta existente nao confirma cadastro publico", async () => {
  const agente = request.agent(aplicacao), email = "aguardando-confirmacao@outlook.com";
  const csrf = await obterCsrf(agente);
  assert.equal((await agente.post("/api/autenticacao/cadastro").set("X-CSRF-Token",csrf).send({nome:"Aluno Pendente",email,senha:"Senha-forte-123"})).status,201);
  const antigo = tokenEmailMaisRecente();
  emailProvider.limpar();
  await solicitarRecuperacao(agente,email);
  assert.equal(emailProvider.obterMensagens().length,0);
  assert.equal((await entrar(agente,email,"Senha-forte-123")).status,403);
  assert.equal((await confirmarCadastro(agente,antigo)).status,200);
  await solicitarRecuperacao(agente,email);
  assert.equal((await agente.post("/api/autenticacao/recuperacao-senha/redefinir").set("X-CSRF-Token",await obterCsrf(agente)).send({token:extrairTokenDeRecuperacao(),novaSenha:"Senha-nova-456"})).status,200);
  assert.equal((await entrar(agente,email,"Senha-nova-456")).status,200);
  await solicitarEmail(agente,email,"Senha-nova-456");
  assert.equal((await confirmarCadastro(agente,tokenEmailMaisRecente())).status,400);
  assert.equal((await agente.get("/api/autenticacao/me")).status,200);
});

test("falha ao marcar novo cadastro pendente reverte criacao inteira", async () => {
  const poolFalho = { getConnection: async () => {
    const real = await pool.getConnection();
    return { beginTransaction: () => real.beginTransaction(), commit: () => real.commit(), rollback: () => real.rollback(), release: () => real.release(),
      execute: (sql, parametros) => {
        if (sql.startsWith("INSERT INTO cadastros_email_pendentes")) throw new Error("Persistencia indisponivel");
        return real.execute(sql,parametros);
      } };
  } };
  const repo = require("../src/modules/usuarios/usuarioRepository")(poolFalho);
  await assert.rejects(repo.criarAlunoComConfirmacao("Aluno Novo","rollback-pendente@example.com","hash-teste"),/Persistencia indisponivel/);
  const [[contagem]] = await pool.execute("SELECT COUNT(*) AS total FROM usuarios WHERE email=?",["rollback-pendente@example.com"]);
  assert.equal(Number(contagem.total),0);
});

test("pendencia do fluxo anterior confirma sem recriar ou modificar a identidade da conta",async()=>{
  const repo=require("../src/modules/usuarios/usuarioRepository")(pool);
  const hash=await require("../src/modules/autenticacao/senha").criarHashDaSenha("Senha-forte-123");
  const antigo=await repo.criarAlunoComConfirmacao("Conta Anterior","pendencia-antiga@hotmail.com",hash);
  const agente=request.agent(aplicacao);
  assert.equal((await entrar(agente,antigo.email,"Senha-forte-123")).status,403);
  assert.equal((await reenviarCadastro(agente,antigo.email)).status,200);
  assert.equal((await confirmarCadastro(agente,tokenEmailMaisRecente())).status,200);
  const atual=await repo.buscarPorId(antigo.id);
  assert.equal(atual.id,antigo.id);
  assert.equal(atual.senhaHash,hash);
  assert.equal(atual.papel,"aluno");
  assert.equal(atual.versaoSessao,antigo.versaoSessao);
  assert.equal(atual.cadastroEmailPendente,false);
  assert.equal((await entrar(agente,antigo.email,"Senha-forte-123")).status,200);
});

test("reenvio nao toma email existente e confirmacao publica exige CSRF", async () => {
  const agente = request.agent(aplicacao);
  await cadastrar(agente,"ocupado@example.com","Senha-forte-123");
  await agente.post("/api/autenticacao/cadastro").set("X-CSRF-Token",await obterCsrf(agente)).send({nome:"Aluno Pendente",email:"pendente@example.com",senha:"Senha-forte-123"});
  assert.equal((await reenviarCadastro(agente,"pendente@example.com","ocupado@example.com")).status,409);
  assert.equal((await agente.post("/api/autenticacao/cadastro/email/confirmar").send({token:tokenEmailMaisRecente()})).status,403);
  assert.equal((await entrar(agente,"pendente@example.com","Senha-forte-123")).status,403);
  assert.equal((await entrar(agente,"ocupado@example.com","Senha-forte-123")).status,200);
});

test("cadastro rejeita nome sem sobrenome antes de gravar e preserva login de nomes antigos", async () => {
  const agente = request.agent(aplicacao);
  for (const nome of ["Ana", "Ana de", "Ana 123"]) {
    const resposta = await cadastrar(agente,"nome-incompleto@outlook.com","Senha-forte-123",{nome});
    assert.equal(resposta.status,400);
    assert.equal(resposta.body.erro.codigo,"NOME_COMPLETO_OBRIGATORIO");
    assert.match(resposta.body.erro.mensagem,/pelo menos um sobrenome/);
  }
  const [[total]] = await pool.execute("SELECT COUNT(*) AS total FROM usuarios WHERE email='nome-incompleto@outlook.com'");
  assert.equal(Number(total.total),0);
  const novo = await cadastrar(agente,"nome-completo@outlook.com","Senha-forte-123",{nome:"  João   da Silva  "});
  assert.equal(novo.status,201);
  assert.equal(novo.body.usuario.nome,"João da Silva");
  const hash = await require("../src/modules/autenticacao/senha").criarHashDaSenha("Senha-forte-123");
  await pool.execute("INSERT INTO usuarios(nome,email,senha_hash,papel) VALUES (?,?,?,?)",["Ana","nome-antigo@outlook.com",hash,"aluno"]);
  assert.equal((await entrar(agente,"nome-antigo@outlook.com","Senha-forte-123")).status,200);
  assert.equal((await agente.get("/api/autenticacao/me")).body.usuario.nome,"Ana");
});

test("lembrete apenas nas contas indicadas preserva login e sessao e desaparece ao confirmar", async () => {
  const hash = await require("../src/modules/autenticacao/senha").criarHashDaSenha("Senha-forte-123");
  for (const id of [5,11,59,78,26,2]) {
    await pool.execute("INSERT INTO usuarios(id,nome,email,senha_hash,papel) VALUES (?,?,?,?,?)",[id,"Conta existente",`legado-${id}@example.com`,hash,id===5?"admin":id===11?"professor":"aluno"]);
  }
  const [antes] = await pool.execute("SELECT id,email,ativo,senha_hash,versao_sessao,papel FROM usuarios ORDER BY id");
  const sql = await require("node:fs/promises").readFile(require("node:path").join(__dirname,"../migrations/028_lembretes_email.sql"),"utf8");
  const insercao = sql.slice(sql.indexOf("INSERT IGNORE"));
  await pool.query(insercao);
  await pool.query(insercao);
  const [depois] = await pool.execute("SELECT id,email,ativo,senha_hash,versao_sessao,papel FROM usuarios ORDER BY id");
  assert.deepEqual(depois,antes);
  const [[total]] = await pool.execute("SELECT COUNT(*) AS total FROM lembretes_email");
  assert.equal(Number(total.total),5);
  for (const id of [5,11,59,78,26,2]) {
    const agente = request.agent(aplicacao);
    const email = `legado-${id}@example.com`;
    const login = await entrar(agente,email,"Senha-forte-123");
    assert.equal(login.status,200);
    assert.equal(login.body.usuario.emailPrecisaRevisao,id!==2);
    assert.equal((await agente.get("/api/autenticacao/me")).body.usuario.emailPrecisaRevisao,id!==2);
    if (id===5) {
      await solicitarEmail(agente,email);
      const token = tokenEmailMaisRecente();
      assert.equal((await confirmarEmail(agente,token)).status,200);
      assert.equal((await agente.get("/api/autenticacao/me")).body.usuario.emailPrecisaRevisao,false);
      await pool.query(insercao);
      assert.equal((await entrar(agente,email,"Senha-forte-123")).body.usuario.emailPrecisaRevisao,false);
    }
  }
});

test("indisponibilidade do lembrete nao interfere na conta autenticada", async () => {
  const avisos = [];
  const service = require("../src/modules/autenticacao/emailContaService")({
    repository:{precisaRevisao: async () => {throw new Error("Banco indisponivel");}},
    logger:{warn:(...dados)=>avisos.push(dados)}
  });
  const usuario = {id:5,papel:"admin",ativo:true,email:"legado@example.com"};
  assert.deepEqual(await service.obterAviso(usuario),{...usuario,emailPrecisaRevisao:false});
  assert.equal(avisos.length,1);
  assert.equal(JSON.stringify(avisos).includes(usuario.email),false);
});

test("abrir outra aba nao invalida o CSRF da aba ja aberta", async () => {
  const agente = request.agent(aplicacao);
  await cadastrar(agente, "abas@hotmail.com", "Senha-forte-123");
  await entrar(agente, "abas@hotmail.com", "Senha-forte-123");
  const csrfPrimeiraAba = await obterCsrf(agente);
  const csrfSegundaAba = await obterCsrf(agente);
  assert.equal(csrfSegundaAba, csrfPrimeiraAba);
  const resposta = await agente.post("/api/autenticacao/email/solicitar").set("X-CSRF-Token", csrfPrimeiraAba).send({email:"abas@proton.me",senha:"Senha-forte-123"});
  assert.equal(resposta.status, 200);
});

test("recuperacao iniciada antes da troca nao emite link para o endereco antigo apos confirmar", async () => {
  const agente = request.agent(aplicacao);
  const cadastro = await cadastrar(agente, "antes@hotmail.com", "Senha-forte-123");
  await entrar(agente, "antes@hotmail.com", "Senha-forte-123");
  const usuarios = require("../src/modules/usuarios/usuarioRepository")(pool);
  const observado = await usuarios.buscarPorId(cadastro.body.usuario.id);
  await solicitarEmail(agente, "depois@outlook.com");
  assert.equal((await confirmarEmail(agente, tokenEmailMaisRecente())).status, 200);
  emailProvider.limpar();
  const service = require("../src/modules/autenticacao/autenticacaoService").criarAutenticacaoService({
    usuarioRepository: { buscarPorEmail: async () => observado },
    autenticacaoRepository: require("../src/modules/autenticacao/autenticacaoRepository")(pool),
    emailProvider, configuracao: configuracaoTeste
  });
  const resposta = await service.solicitarRecuperacao({email:observado.email});
  assert.ok(resposta.mensagem);
  assert.equal(emailProvider.obterMensagens().length, 0);
  const [[pendentes]] = await pool.execute("SELECT COUNT(*) AS total FROM recuperacoes_senha WHERE usuario_id=? AND usada_em IS NULL", [observado.id]);
  assert.equal(pendentes.total, 0);
});

async function solicitarEmail(agente, email, senha = "Senha-forte-123") {
  const csrf = await obterCsrf(agente);
  return agente.post("/api/autenticacao/email/solicitar").set("X-CSRF-Token", csrf).send({ email, senha });
}

async function confirmarEmail(agente, token) {
  const csrf = await obterCsrf(agente);
  return agente.post("/api/autenticacao/email/confirmar").set("X-CSRF-Token", csrf).send({ token });
}

test("troca confirmada mantem a conta em todos os perfis e invalida recuperacao antiga", async () => {
  const { criarHashDaSenha } = require("../src/modules/autenticacao/senha");
  const hash = await criarHashDaSenha("Senha-forte-123");
  const repo = require("../src/modules/usuarios/usuarioRepository")(pool);
  for (const papel of ["aluno", "professor", "admin"]) {
    const antigo = `antigo-${papel}@proton.me`, novo = `novo-${papel}@outlook.com`;
    const conta = await repo.criar("Conta existente", antigo, hash, papel);
    const agente = request.agent(aplicacao);
    assert.equal((await entrar(agente, antigo, "Senha-forte-123")).status, 200);
    emailProvider.limpar();
    await solicitarRecuperacao(agente, antigo);
    const recuperacaoAntiga = extrairTokenDeRecuperacao();
    assert.equal((await solicitarEmail(agente, novo)).status, 200);
    assert.equal((await repo.buscarPorId(conta.id)).email, antigo);
    assert.equal((await entrar(request.agent(aplicacao), antigo, "Senha-forte-123")).status, 200);
    const token = tokenEmailMaisRecente();
    const [[persistido]] = await pool.execute("SELECT token_hash FROM confirmacoes_email WHERE usuario_id=?", [conta.id]);
    assert.notEqual(persistido.token_hash, token);
    assert.equal(persistido.token_hash, gerarHashDoToken(token));
    const resposta = await confirmarEmail(agente, token);
    assert.equal(resposta.status, 200, JSON.stringify(resposta.body));
    assert.equal(resposta.body.usuario.id, conta.id);
    assert.equal(resposta.body.usuario.papel, papel);
    assert.equal(resposta.body.usuario.email, novo);
    assert.equal((await agente.get("/api/autenticacao/me")).body.usuario.email, novo);
    assert.equal((await confirmarEmail(agente, token)).status, 400);
    assert.equal((await entrar(request.agent(aplicacao), novo, "Senha-forte-123")).status, 200);
    assert.equal((await entrar(request.agent(aplicacao), antigo, "Senha-forte-123")).status, 401);
    const csrf = await obterCsrf(agente);
    const redefinir = await agente.post("/api/autenticacao/recuperacao-senha/redefinir").set("X-CSRF-Token", csrf).send({ token: recuperacaoAntiga, novaSenha: "Outra-senha-123" });
    assert.equal(redefinir.status, 400);
  }
});

test("confirmacao exige senha atual, sessao e CSRF e nao pode ser usada por outra conta", async () => {
  const agente = request.agent(aplicacao), outro = request.agent(aplicacao);
  await cadastrar(agente, "original@gmail.com", "Senha-forte-123");
  await cadastrar(outro, "outra@hotmail.com", "Senha-forte-123");
  await entrar(agente, "original@gmail.com", "Senha-forte-123");
  await entrar(outro, "outra@hotmail.com", "Senha-forte-123");
  assert.equal((await solicitarEmail(request.agent(aplicacao), "novo@icloud.com")).status, 401);
  assert.equal((await agente.post("/api/autenticacao/email/solicitar").send({email:"novo@icloud.com",senha:"Senha-forte-123"})).status, 403);
  assert.equal((await solicitarEmail(agente, "novo@icloud.com", "Senha-errada-123")).status, 401);
  assert.equal(emailProvider.obterMensagens().length, 0);
  assert.equal((await solicitarEmail(agente, "original@gmail.com")).status, 200);
  const token = tokenEmailMaisRecente();
  assert.equal((await confirmarEmail(outro, token)).status, 400);
  assert.equal((await confirmarEmail(agente, "x".repeat(43))).status, 400);
  assert.equal((await confirmarEmail(agente, token)).status, 200);
});

test("reenvio, expiracao e email ocupado preservam o endereco anterior", async () => {
  const agente = request.agent(aplicacao);
  const criada = await cadastrar(agente, "atual@yahoo.com", "Senha-forte-123");
  await entrar(agente, "atual@yahoo.com", "Senha-forte-123");
  await solicitarEmail(agente, "novo@icloud.com");
  const primeiro = tokenEmailMaisRecente();
  await solicitarEmail(agente, "novo@icloud.com");
  const segundo = tokenEmailMaisRecente();
  assert.equal((await confirmarEmail(agente, primeiro)).status, 400);
  await pool.execute("UPDATE confirmacoes_email SET expira_em=DATE_SUB(NOW(),INTERVAL 1 MINUTE) WHERE token_hash=?", [gerarHashDoToken(segundo)]);
  assert.equal((await confirmarEmail(agente, segundo)).status, 400);
  await solicitarEmail(agente, "ocupado@hotmail.com");
  const tokenAntesDeOcupar = tokenEmailMaisRecente();
  // Outra conta pode ocupar o endereco entre o envio e a confirmacao.
  await cadastrar(request.agent(aplicacao), "ocupado@hotmail.com", "Senha-forte-123");
  const resposta = await confirmarEmail(agente, tokenAntesDeOcupar);
  assert.equal(resposta.status, 409);
  assert.equal(resposta.body.erro.codigo, "EMAIL_JA_CADASTRADO");
  const [[conta]] = await pool.execute("SELECT email FROM usuarios WHERE id=?", [criada.body.usuario.id]);
  assert.equal(conta.email, "atual@yahoo.com");
  const quantidade = emailProvider.obterMensagens().length;
  assert.equal((await solicitarEmail(agente, "ocupado@hotmail.com")).status, 409);
  assert.equal(emailProvider.obterMensagens().length, quantidade);
});

test("confirmacoes concorrentes nao duplicam auditoria nem tomam email de outra conta", async () => {
  const primeiro = request.agent(aplicacao), segundo = request.agent(aplicacao);
  const conta1 = (await cadastrar(primeiro, "concorrente1@yahoo.com", "Senha-forte-123")).body.usuario;
  await cadastrar(segundo, "concorrente2@proton.me", "Senha-forte-123");
  await entrar(primeiro, "concorrente1@yahoo.com", "Senha-forte-123");
  await entrar(segundo, "concorrente2@proton.me", "Senha-forte-123");
  await solicitarEmail(primeiro, "destino@outlook.com");
  const token1 = tokenEmailMaisRecente();
  await solicitarEmail(segundo, "destino@outlook.com");
  const token2 = tokenEmailMaisRecente();
  const respostas = await Promise.all([confirmarEmail(primeiro, token1), confirmarEmail(segundo, token2)]);
  assert.deepEqual(respostas.map(r=>r.status).sort(), [200,409]);
  const [[contas]] = await pool.execute("SELECT COUNT(*) AS total FROM usuarios WHERE email='destino@outlook.com'");
  assert.equal(contas.total, 1);
  const vencedor = respostas[0].status === 200 ? primeiro : segundo;
  await solicitarEmail(vencedor, "outro@icloud.com");
  const novoToken = tokenEmailMaisRecente();
  const repetidas = await Promise.all([confirmarEmail(vencedor, novoToken), confirmarEmail(vencedor, novoToken)]);
  assert.deepEqual(repetidas.map(r=>r.status).sort(), [200,400]);
  const [[auditorias]] = await pool.execute("SELECT COUNT(*) AS total FROM auditoria_geral WHERE acao='email_atualizado' AND ator_usuario_id IN (SELECT id FROM usuarios)");
  assert.equal(auditorias.total, 2);
  assert.ok((await pool.execute("SELECT id FROM usuarios WHERE id=?",[conta1.id]))[0].length);
});

test("troca preserva historico e permissoes e suporte usa o novo endereco da sessao", async () => {
  const aluno = request.agent(aplicacao), professor = request.agent(aplicacao);
  const alunoId = (await cadastrar(aluno,"historico@outlook.com","Senha-forte-123")).body.usuario.id;
  const professorId = (await cadastrar(professor,"professor@hotmail.com","Senha-forte-123")).body.usuario.id;
  await pool.execute("UPDATE usuarios SET papel='professor' WHERE id=?", [professorId]);
  const [pasta] = await pool.execute("INSERT INTO categorias(nome,drive_pasta_id) VALUES ('Pasta QA','pasta-email-qa')");
  const [material] = await pool.execute("INSERT INTO materiais(drive_file_id,categoria_id,nome,mime_type,tipo,extensao) VALUES ('arquivo-email-qa',?,'Arquivo QA.pdf','application/pdf','pdf','pdf')",[pasta.insertId]);
  await pool.execute("INSERT INTO historico_materiais_usuario(usuario_id,material_id,ultima_acao,ultima_visualizacao_em) VALUES (?,?,'visualizacao',NOW())",[alunoId,material.insertId]);
  await pool.execute("INSERT INTO permissoes_professor_categoria(professor_id,categoria_id,concedida_por_usuario_id) VALUES (?,?,?)",[professorId,pasta.insertId,professorId]);
  const [historicoAntes] = await pool.execute("SELECT * FROM historico_materiais_usuario WHERE usuario_id=?",[alunoId]);
  const [permissoesAntes] = await pool.execute("SELECT * FROM permissoes_professor_categoria WHERE professor_id=?",[professorId]);
  for (const [agente, email, novo] of [[aluno,"historico@outlook.com","historico@proton.me"],[professor,"professor@hotmail.com","professor@yahoo.com"]]) {
    await entrar(agente,email,"Senha-forte-123");
    assert.equal((await solicitarEmail(agente,novo)).status,200);
    assert.equal((await confirmarEmail(agente,tokenEmailMaisRecente())).status,200);
    const csrf = await obterCsrf(agente);
    assert.equal((await agente.post("/api/suporte").set("X-CSRF-Token",csrf).send({assunto:"Teste suporte",mensagem:"Mensagem controlada de teste."})).status,202);
    assert.equal(emailProvider.obterMensagens().at(-1).email,novo);
  }
  const [historicoDepois] = await pool.execute("SELECT * FROM historico_materiais_usuario WHERE usuario_id=?",[alunoId]);
  const [permissoesDepois] = await pool.execute("SELECT * FROM permissoes_professor_categoria WHERE professor_id=?",[professorId]);
  assert.deepEqual(historicoDepois,historicoAntes);
  assert.deepEqual(permissoesDepois,permissoesAntes);
});

test("rejeita dados extras e conta bloqueada e limita reenvios sem trocar email", async () => {
  const agente = request.agent(aplicacao);
  const usuario = (await cadastrar(agente,"limite@outlook.com","Senha-forte-123")).body.usuario;
  await entrar(agente,usuario.email,"Senha-forte-123");
  const csrf = await obterCsrf(agente);
  const extras = await agente.post("/api/autenticacao/email/solicitar").set("X-CSRF-Token",csrf).send({email:"novo@proton.me",senha:"Senha-forte-123",usuarioId:999});
  assert.equal(extras.status,400);
  for (let i=0; i<9; i++) assert.equal((await solicitarEmail(agente,"novo@proton.me")).status,200);
  assert.equal((await solicitarEmail(agente,"novo@proton.me")).status,429);
  assert.equal((await agente.get("/api/autenticacao/me")).body.usuario.email,usuario.email);
  await pool.execute("UPDATE usuarios SET ativo=0 WHERE id=?",[usuario.id]);
  assert.equal((await confirmarEmail(agente,tokenEmailMaisRecente())).status,401);
});

test("recuperar a senha antes de confirmar o email cancela a capacidade do link antigo", async () => {
  const agente = request.agent(aplicacao);
  await cadastrar(agente, "esqueci@proton.me", "Senha-forte-123");
  await entrar(agente, "esqueci@proton.me", "Senha-forte-123");
  await solicitarEmail(agente, "novo@gmail.com");
  const token = tokenEmailMaisRecente();
  emailProvider.limpar();
  await solicitarRecuperacao(agente, "esqueci@proton.me");
  const csrf = await obterCsrf(agente);
  const recuperada = await agente.post("/api/autenticacao/recuperacao-senha/redefinir").set("X-CSRF-Token", csrf).send({token:extrairTokenDeRecuperacao(),novaSenha:"Senha-nova-456"});
  assert.equal(recuperada.status, 200);
  await entrar(agente, "esqueci@proton.me", "Senha-nova-456");
  assert.equal((await confirmarEmail(agente, token)).status, 400);
  assert.equal((await agente.get("/api/autenticacao/me")).body.usuario.email, "esqueci@proton.me");
});

test("falha de SMTP e auditoria revertem a troca sem perder acesso", async () => {
  const agente = request.agent(aplicacao);
  const criada = await cadastrar(agente, "preservado@hotmail.com", "Senha-forte-123");
  await entrar(agente, "preservado@hotmail.com", "Senha-forte-123");
  const enviar = emailProvider.enviarConfirmacaoEmail;
  emailProvider.enviarConfirmacaoEmail = async () => { throw new Error("SMTP indisponivel"); };
  assert.equal((await solicitarEmail(agente, "novo@gmail.com")).status, 503);
  emailProvider.enviarConfirmacaoEmail = enviar;
  const [[cancelado]] = await pool.execute("SELECT cancelada_em FROM confirmacoes_email WHERE usuario_id=? ORDER BY id DESC LIMIT 1", [criada.body.usuario.id]);
  assert.ok(cancelado.cancelada_em);
  await solicitarEmail(agente, "novo@gmail.com");
  const token = tokenEmailMaisRecente();
  const repoUsuario = require("../src/modules/usuarios/usuarioRepository")(pool);
  const repoEmail = require("../src/modules/autenticacao/emailContaRepository")(pool, repoUsuario, { registrar: async () => { throw new Error("Auditoria indisponivel"); } });
  await assert.rejects(repoEmail.confirmar(criada.body.usuario.id, gerarHashDoToken(token)), /Auditoria indisponivel/);
  assert.equal((await repoUsuario.buscarPorId(criada.body.usuario.id)).email, "preservado@hotmail.com");
  assert.equal((await confirmarEmail(agente, token)).status, 200);
});

test("confirmacao voluntaria preserva login, sessao e recuperacao de contas antigas de todos os perfis", async () => {
  const { criarHashDaSenha } = require("../src/modules/autenticacao/senha");
  const hash = await criarHashDaSenha("Senha-legada-forte-123");
  for (const papel of ["aluno", "professor", "admin"]) {
    const email = `legado-${papel}@example.com`;
    const [inserido] = await pool.execute("INSERT INTO usuarios(nome,email,senha_hash,papel) VALUES (?,?,?,?)", ["Conta legada",email,hash,papel]);
    const agente = request.agent(aplicacao);
    assert.equal((await entrar(agente,email,"Senha-legada-forte-123")).status,200);
    assert.equal((await agente.get("/api/autenticacao/me")).body.usuario.id,Number(inserido.insertId));
    emailProvider.limpar();
    assert.equal((await solicitarRecuperacao(agente,email)).status,200);
    assert.equal(emailProvider.obterMensagens()[0].destinatario,email);
    const token = extrairTokenDeRecuperacao();
    const csrf = await obterCsrf(agente);
    const redefinicao = await agente.post("/api/autenticacao/recuperacao-senha/redefinir").set("X-CSRF-Token",csrf).send({token,novaSenha:"Senha-nova-legada-456"});
    assert.equal(redefinicao.status,200);
    const novoAgente = request.agent(aplicacao);
    assert.equal((await entrar(novoAgente,email,"Senha-nova-legada-456")).status,200);
    assert.equal((await entrar(request.agent(aplicacao),email,"Senha-legada-forte-123")).status,401);
    const [conta] = await pool.execute("SELECT id,email,papel,ativo FROM usuarios WHERE id=?",[inserido.insertId]);
    assert.equal(conta[0].email,email);
    assert.equal(conta[0].papel,papel);
    assert.equal(conta[0].ativo,1);
  }
});

test("cadastro aceita diferentes provedores e preserva validacao de formato", async () => {
  const agente = request.agent(aplicacao);
  for (const email of ["novo", "novo@@gmail.com", "novo@", "novo @gmail.com"]) {
    const resposta = await cadastrar(agente,email,"Senha-forte-123");
    assert.equal(resposta.status,400);
    assert.equal(resposta.body.erro.codigo,"EMAIL_INVALIDO");
  }
  const resposta = await cadastrar(agente," Novo@GMAIL.COM ","Senha-forte-123");
  assert.equal(resposta.status,201);
  assert.equal(resposta.body.usuario.email,"novo@gmail.com");
  for (const dominio of ["outlook.com", "hotmail.com", "proton.me", "yahoo.com", "icloud.com", "aluno.mg.gov.br"]) {
    assert.equal((await cadastrar(agente,"novo@" + dominio,"Senha-forte-123")).status,201);
  }
  const [contas] = await pool.execute("SELECT COUNT(*) AS total FROM usuarios");
  assert.equal(contas[0].total,7);
});

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
    "Aluno@gmail.com",
    "Senha-forte-123"
  );

  assert.equal(resposta.status, 201);
  assert.equal(resposta.body.usuario.nome, "Aluno Teste");
  assert.equal(resposta.body.usuario.email, "aluno@gmail.com");
  assert.equal(resposta.body.usuario.papel, "aluno");
  assert.equal(JSON.stringify(resposta.body).includes("Senha-forte-123"), false);

  const [usuarios] = await pool.execute(
    "SELECT nome, senha_hash, papel FROM usuarios WHERE email = ?",
    ["aluno@gmail.com"]
  );
  assert.match(usuarios[0].senha_hash, /^\$argon2id\$/);
  assert.equal(usuarios[0].nome, "Aluno Teste");
  assert.equal(usuarios[0].senha_hash.includes("Senha-forte-123"), false);
  assert.equal(usuarios[0].papel, "aluno");
});

test("rejeita cadastro invalido, duplicado e mass assignment", async function testarCadastroInvalido() {
  const agente = request.agent(aplicacao);
  const csrf = await obterCsrf(agente);
  const semNome = await agente.post("/api/autenticacao/cadastro")
    .set("X-CSRF-Token", csrf)
    .send({ email: "sem-nome@gmail.com", senha: "Senha-forte-123" });
  assert.equal(semNome.status, 400);
  assert.equal(semNome.body.erro.codigo, "NOME_INVALIDO");
  const invalido = await cadastrar(agente, "email-invalido", "curta");
  assert.equal(invalido.status, 400);

  const primeiro = await cadastrar(agente, "duplicado@gmail.com", "Senha-forte-123");
  assert.equal(primeiro.status, 201);
  const duplicado = await cadastrar(agente, "DUPLICADO@gmail.com", "Outra-senha-123");
  assert.equal(duplicado.status, 409);

  const escalacao = await cadastrar(
    agente,
    "admin-falso@gmail.com",
    "Senha-forte-123",
    { papel: "admin", ativo: true, usuarioId: 1 }
  );
  assert.equal(escalacao.status, 400);
  assert.equal(escalacao.body.erro.codigo, "CAMPOS_NAO_PERMITIDOS");
  const [registros] = await pool.execute(
    "SELECT COUNT(*) AS quantidade FROM usuarios WHERE email = ?",
    ["admin-falso@gmail.com"]
  );
  assert.equal(Number(registros[0].quantidade), 0);
});

test("login cria cookie seguro e banco guarda somente hash do token", async function testarLogin() {
  const agente = request.agent(aplicacao);
  await cadastrar(agente, "login@gmail.com", "Senha-forte-123");
  const resposta = await entrar(agente, "login@gmail.com", "Senha-forte-123");

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
    .send({ nome: "Conta Segura", email: "secure@gmail.com", senha: "Senha-forte-123" });
  assert.equal((await request(aplicacao).post("/api/autenticacao/cadastro/email/confirmar")
    .set("Cookie", configuracaoProducao.seguranca.nomeCookieCsrf + "=" + tokenCsrf)
    .set("X-CSRF-Token", tokenCsrf).send({token:tokenEmailMaisRecente()})).status,200);
  const resposta = await request(aplicacao)
    .post("/api/autenticacao/login")
    .set("Cookie", configuracaoProducao.seguranca.nomeCookieCsrf + "=" + tokenCsrf)
    .set("X-CSRF-Token", tokenCsrf)
    .send({ email: "secure@gmail.com", senha: "Senha-forte-123" });
  const cookieSessao = resposta.headers["set-cookie"].find(function localizarCookie(cookie) {
    return cookie.startsWith(configuracaoTeste.seguranca.nomeCookieSessao + "=");
  });
  assert.match(cookieSessao, /Secure/i);
});

test("login invalido, inexistente, desativado e SQL Injection usam resposta segura", async function testarLoginNegado() {
  const agente = request.agent(aplicacao);
  await cadastrar(agente, "negado@gmail.com", "Senha-forte-123");

  const senhaErrada = await entrar(agente, "negado@gmail.com", "Senha-errada-123");
  const inexistente = await entrar(agente, "inexistente@gmail.com", "Senha-errada-123");
  const injecao = await entrar(agente, "x'or'1'='1@gmail.com", "Senha-errada-123");
  assert.equal(senhaErrada.status, 401);
  assert.equal(inexistente.status, 401);
  assert.equal(injecao.status, 401);
  assert.deepEqual(senhaErrada.body, inexistente.body);

  await pool.execute("UPDATE usuarios SET ativo = 0 WHERE email = ?", ["negado@gmail.com"]);
  const desativado = await entrar(agente, "negado@gmail.com", "Senha-forte-123");
  assert.equal(desativado.status, 401);
  assert.equal(desativado.body.erro.codigo, "CREDENCIAIS_INVALIDAS");
});

test("sessao adulterada e expirada sao recusadas", async function testarSessoesInvalidas() {
  const agente = request.agent(aplicacao);
  await cadastrar(agente, "sessao@gmail.com", "Senha-forte-123");
  await entrar(agente, "sessao@gmail.com", "Senha-forte-123");
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
  await cadastrar(agente, "logout@gmail.com", "Senha-forte-123");
  await entrar(agente, "logout@gmail.com", "Senha-forte-123");
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
    .send({ email: "csrf@gmail.com", senha: "Senha-forte-123" });
  assert.equal(semToken.status, 403);

  await obterCsrf(agente);
  const adulterado = await agente
    .post("/api/autenticacao/login")
    .set("X-CSRF-Token", "token.adulterado")
    .send({ email: "csrf@gmail.com", senha: "Senha-forte-123" });
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
      .send({ email: "brute@gmail.com", senha: "Senha-errada-123" });
  }

  assert.equal(resposta.status, 429);
  assert.equal(resposta.body.erro.codigo, "LIMITE_AUTENTICACAO");
  assert.ok(resposta.headers["ratelimit-policy"]);
});

test("aluno e professor nao acessam operacoes de admin", async function testarAutorizacao() {
  const aluno = request.agent(aplicacao);
  await cadastrar(aluno, "aluno-role@gmail.com", "Senha-forte-123");
  await entrar(aluno, "aluno-role@gmail.com", "Senha-forte-123");
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
    ["professor", "aluno-role@gmail.com"]
  );
  const professor = request.agent(aplicacao);
  await entrar(professor, "aluno-role@gmail.com", "Senha-forte-123");
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
    "primeiro-admin@gmail.com",
    "Senha-admin-forte-123"
  );
  assert.equal(admin.papel, "admin");
  assert.match(admin.senhaHash, /^\$argon2id\$/);
  await assert.rejects(
    executarBootstrapAdmin(pool, "segundo-admin@gmail.com", "Senha-admin-forte-456"),
    /ja existe um admin/
  );
});

test("admin altera papel e estado sem aceitar manipulacao de identidade", async function testarGestaoAdmin() {
  await executarBootstrapAdmin(pool, "admin@gmail.com", "Senha-admin-forte-123");
  const aluno = request.agent(aplicacao);
  const cadastro = await cadastrar(aluno, "gerenciado@gmail.com", "Senha-forte-123");
  const alvoId = cadastro.body.usuario.id;
  const admin = request.agent(aplicacao);
  await entrar(admin, "admin@gmail.com", "Senha-admin-forte-123");
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
    "gerenciado@gmail.com",
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
  await cadastrar(agente, "recuperacao@gmail.com", "Senha-antiga-123");
  await entrar(agente, "recuperacao@gmail.com", "Senha-antiga-123");

  const existente = await solicitarRecuperacao(agente, "recuperacao@gmail.com");
  const mensagemExistente = existente.body.mensagem;
  assert.equal(Object.hasOwn(existente.body, "token"), false);
  assert.equal(
    emailProvider.obterMensagens()[0].destinatario,
    "recuperacao@gmail.com"
  );
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
  const senhaAntiga = await entrar(request.agent(aplicacao), "recuperacao@gmail.com", "Senha-antiga-123");
  assert.equal(senhaAntiga.status, 401);
  const senhaNova = await entrar(request.agent(aplicacao), "recuperacao@gmail.com", "Senha-nova-forte-456");
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
    "nao-existe@gmail.com"
  );
  assert.equal(inexistente.body.mensagem, mensagemExistente);
  assert.equal(emailProvider.obterMensagens().length, 0);
});

test("token de recuperacao expirado e recusado", async function testarTokenExpirado() {
  const agente = request.agent(aplicacao);
  await cadastrar(agente, "expirado@gmail.com", "Senha-antiga-123");
  await solicitarRecuperacao(agente, "expirado@gmail.com");
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
