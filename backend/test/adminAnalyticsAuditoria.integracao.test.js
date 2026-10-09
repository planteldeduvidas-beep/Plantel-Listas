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
  await pool.execute("DELETE FROM cadastros_publicos_pendentes");
  await pool.execute("DELETE FROM historico_materiais_usuario");
  await pool.execute("DELETE FROM analytics_resumo_diario");
  await pool.execute("DELETE FROM analytics_materiais_diario");
  await pool.execute("DELETE FROM analytics_buscas_diario");
  await pool.execute("DELETE FROM analytics_pastas_diario");
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

test("aceite de alunos existentes preserva acesso, isola papeis e e idempotente e transacional", async () => {
  const id=await usuario('aluno-termos@example.com','aluno');
  await usuario('prof-termos@example.com','professor'); await usuario('admin-termos@example.com','admin');
  const aluno=await sessao('aluno-termos@example.com');
  const aceite={aceito:true,...require('../../shared/documentosLegais.json')};
  const rota='/api/autenticacao/termos';
  assert.equal((await request(aplicacao).get(rota)).status,401);
  assert.equal((await aluno.agente.get(rota)).body.pendente,true);
  assert.equal((await aluno.agente.get('/api/autenticacao/me')).status,200);
  assert.equal((await aluno.agente.post(rota+'/aceitar').send(aceite)).status,403);
  for(const email of ['prof-termos@example.com','admin-termos@example.com']) {
    const equipe=await sessao(email);
    assert.deepEqual((await equipe.agente.get(rota)).body,{aplicavel:false});
    assert.equal((await equipe.agente.post(rota+'/aceitar').set('X-CSRF-Token',equipe.csrf).send(aceite)).status,403);
  }
  const falho=require('../src/modules/autenticacao/termosService').criarTermosService(pool,{registrar:async()=>{throw Error('falha QA');}});
  await assert.rejects(falho.aceitar({id,papel:'aluno'},aceite),/falha QA/);
  assert.equal((await aluno.agente.get(rota)).body.pendente,true);
  for(let i=0;i<2;i++) assert.equal((await aluno.agente.post(rota+'/aceitar').set('X-CSRF-Token',aluno.csrf).send(aceite)).status,200);
  const [[r]]=await pool.execute('SELECT COUNT(*) n FROM aceites_termos_alunos WHERE usuario_id=?',[id]);
  assert.equal(r.n,1);
  const [[aud]]=await pool.execute("SELECT COUNT(*) n FROM auditoria_geral WHERE ator_usuario_id=? AND acao='termos_aceitos'",[id]);
  assert.equal(aud.n,1);
  const outraSessao=await sessao('aluno-termos@example.com');
  assert.equal((await outraSessao.agente.get(rota)).body.pendente,false);
});

test("detalhes e acoes administrativas usam usuario certo, preservam historico e exigem admin", async () => {
  const adminId = await usuario("admin-detalhes@example.com","admin");
  const alunoId = await usuario("aluno-detalhes@escola.edu.br","aluno");
  const professorId = await usuario("professor-detalhes@proton.me","professor");
  const admin = await sessao("admin-detalhes@example.com");
  const aluno = await sessao("aluno-detalhes@escola.edu.br");
  const prefixo = "/api/usuarios/" + alunoId;
  const dados = (await admin.agente.get(prefixo)).body.usuario;
  assert.equal(dados.id,alunoId);
  assert.ok(dados.ultimoLogin);
  assert.ok(dados.inatividadeSegundos>=0);
  assert.equal(dados.emailConfirmadoEm,null);
  assert.equal(Object.hasOwn(dados,"senhaHash"),false);
  const nunca = (await admin.agente.get("/api/usuarios/"+professorId)).body.usuario;
  assert.equal(nunca.ultimoLogin,null);
  assert.equal(nunca.inatividadeSegundos,null);
  for (const rota of [prefixo,"/api/usuarios/"+professorId]) assert.equal((await aluno.agente.get(rota)).status,403);
  for (const acao of ["regularizacao-email","verificacao-email","redefinicao-senha"]) {
    assert.equal((await aluno.agente.post(prefixo+"/"+acao).set("X-CSRF-Token",aluno.csrf).send({})).status,403);
    assert.equal((await admin.agente.post(prefixo+"/"+acao).set("X-CSRF-Token",admin.csrf).send({})).status,200);
  }
  assert.equal((await admin.agente.post(prefixo+"/verificacao-email").set("X-CSRF-Token",admin.csrf).send({})).status,429);
  assert.equal((await aluno.agente.get("/api/autenticacao/me")).body.usuario.emailPrecisaRevisao,true);
  assert.equal((await admin.agente.delete(prefixo).set("X-CSRF-Token",admin.csrf).send({})).status,400);
  assert.equal((await aluno.agente.delete(prefixo).set("X-CSRF-Token",aluno.csrf).send({confirmar:true})).status,403);
  assert.equal((await admin.agente.delete("/api/usuarios/"+adminId).set("X-CSRF-Token",admin.csrf).send({confirmar:true})).status,409);
  assert.equal((await admin.agente.delete(prefixo).set("X-CSRF-Token",admin.csrf).send({confirmar:true})).status,200);
  assert.equal((await aluno.agente.get("/api/autenticacao/me")).status,401);
  assert.equal((await admin.agente.get(prefixo)).status,404);
  assert.equal((await admin.agente.patch(prefixo+"/ativo").set("X-CSRF-Token",admin.csrf).send({ativo:true})).status,404);
  const [[preservado]] = await pool.execute("SELECT excluido_em,email FROM usuarios WHERE id=?",[alunoId]);
  assert.ok(preservado.excluido_em);
  assert.equal(preservado.email,"aluno-detalhes@escola.edu.br");
  const [[audit]] = await pool.execute("SELECT COUNT(*) AS n FROM auditoria_geral WHERE acao='usuario_excluido' AND entidade_id=?",[alunoId]);
  assert.equal(Number(audit.n),1);
  assert.equal((await admin.agente.get("/api/usuarios?busca=aluno-detalhes")).body.paginacao.total,0);
  assert.equal((await admin.agente.get("/api/analytics?periodo=30")).body.resumo.alunos,0);
  assert.equal((await admin.agente.get("/api/usuarios/"+professorId)).body.usuario.ativo,true);
});

test("cadastros publicos pendentes nao sao usuarios nem metricas; confirmacao concorrente cria somente um", async () => {
  await usuario("admin-pendente@example.com","admin");
  const admin = await sessao("admin-pendente@example.com");
  const fake = criarEmailProviderFake();
  aplicacao = criarAplicacao(configuracao,pino({level:"silent"}),{pool,emailProvider:fake});
  // O agente conserva a sessao persistida no banco, mesmo com app novo.
  const agente = request.agent(aplicacao);
  const token = (await agente.get("/api/autenticacao/csrf")).body.csrfToken;
  const r = await agente.post("/api/autenticacao/cadastro").set("X-CSRF-Token",token).send({nome:"Pessoa Pendente",email:"pendente@instituto.edu.br",senha,faixaEtaria:'18_mais',aceiteTermos:{aceito:true,...require('../../shared/documentosLegais.json')}});
  assert.equal(r.status,201);
  assert.equal(Object.hasOwn(r.body,"usuario"),false);
  const [[conta]] = await pool.execute("SELECT COUNT(*) n FROM usuarios WHERE email='pendente@instituto.edu.br'");
  assert.equal(Number(conta.n),0);
  assert.equal((await admin.agente.get("/api/usuarios?busca=pendente@instituto.edu.br")).body.paginacao.total,0);
  assert.equal((await admin.agente.get("/api/analytics?periodo=30")).body.resumo.alunos,0);
  const confirmacao = new URL(fake.obterMensagens()[0].link).searchParams.get("tokenEmail");
  const [[p]] = await pool.execute("SELECT token_hash,senha_hash FROM cadastros_publicos_pendentes WHERE email=?",["pendente@instituto.edu.br"]);
  assert.notEqual(p.token_hash,confirmacao);
  assert.match(p.senha_hash,/^\$argon2id/);
  const respostas = await Promise.all([1,2].map(()=>agente.post("/api/autenticacao/cadastro/email/confirmar").set("X-CSRF-Token",token).send({token:confirmacao})));
  assert.deepEqual(respostas.map(x=>x.status).sort(),[200,400]);
  const lista = await admin.agente.get("/api/usuarios?busca=pendente@instituto.edu.br");
  assert.equal(lista.body.paginacao.total,1);
  const confirmado = (await admin.agente.get("/api/usuarios/"+lista.body.usuarios[0].id)).body.usuario;
  assert.ok(confirmado.emailConfirmadoEm);
  assert.equal((await admin.agente.get("/api/analytics?periodo=30")).body.resumo.alunos,1);
  const [[pendentes]] = await pool.execute("SELECT COUNT(*) n FROM cadastros_publicos_pendentes");
  assert.equal(Number(pendentes.n),0);
});

test("falha de auditoria desfaz exclusao e revogacao de sessao",async()=>{
  const adminId=await usuario("admin-rollback@example.com","admin");
  const alunoId=await usuario("aluno-rollback@example.com","aluno");
  const aluno=await sessao("aluno-rollback@example.com");
  const repo=require("../src/modules/usuarios/usuarioRepository")(pool);
  const service=require("../src/modules/usuarios/usuarioService")({usuarioRepository:repo,
    autenticacaoRepository:require("../src/modules/autenticacao/autenticacaoRepository")(pool),
    auditoriaRepository:{registrar:async()=>{throw Error("Auditoria indisponivel");}}});
  await assert.rejects(service.excluirUsuario({id:adminId},alunoId,{confirmar:true}),/Auditoria indisponivel/);
  const atual=await repo.buscarPorId(alunoId);
  assert.equal(atual.ativo,true);
  assert.equal(atual.excluidoEm,null);
  assert.equal((await aluno.agente.get("/api/autenticacao/me")).status,200);
});

test("gestao ordena cadastro e ultimo login, filtra confirmacao e preserva paginacao e autorizacao", async () => {
  await usuario("admin-filtros@example.com","admin");
  const admin=await sessao("admin-filtros@example.com");
  const ids=[];
  for (let i=0;i<3;i++) ids.push(await usuario(`filtro-${i}@example.com`,"professor"));
  for (let i=0;i<3;i++) await pool.execute("UPDATE usuarios SET criado_em=? WHERE id=?",[`2025-01-0${i+1} 12:00:00`,ids[i]]);
  for (const [i,dia] of [[0,1],[1,9]]) await pool.execute("INSERT INTO sessoes(usuario_id,token_hash,expira_em,criado_em) VALUES (?,?,DATE_ADD(NOW(),INTERVAL 1 DAY),?)",[ids[i],String(i+1).padStart(64,"0"),`2026-01-0${dia} 12:00:00`]);
  await pool.execute("UPDATE usuarios SET email_confirmado_em=NOW() WHERE id=?",[ids[0]]);
  await pool.execute("INSERT INTO confirmacoes_email(usuario_id,email_anterior,email_destino,usuario_versao,token_hash,expira_em,usada_em) VALUES (?,?,?,1,?,NOW(),NOW())",[ids[1],"filtro-1@example.com","filtro-1@example.com","a".repeat(64)]);
  const consultar=async query => {
    const r=await admin.agente.get("/api/usuarios?busca=filtro-&"+query);
    assert.equal(r.status,200,JSON.stringify(r.body));
    assert.equal(JSON.stringify(r.body).includes("senhaHash"),false);
    return r.body;
  };
  for (const [ordenacao,esperados] of [["cadastro_antigo",ids],["cadastro_recente",[ids[2],ids[1],ids[0]]],["mais_inativos",[ids[2],ids[0],ids[1]]],["menos_inativos",[ids[1],ids[0],ids[2]]],["login_recente",[ids[1],ids[0],ids[2]]],["nunca_entrou",[ids[2]]]]) {
    assert.deepEqual((await consultar("ordenacao="+ordenacao)).usuarios.map(u=>u.id),esperados);
  }
  assert.equal((await consultar("emailConfirmado=true")).paginacao.total,2);
  assert.deepEqual((await consultar("emailConfirmado=false")).usuarios.map(u=>u.id),[ids[2]]);
  const pagina=await consultar("ordenacao=cadastro_antigo&limite=1&pagina=2&emailConfirmado=true&papel=professor&ativo=true");
  assert.equal(pagina.usuarios[0].id,ids[1]); assert.equal(pagina.paginacao.total,2);
  assert.ok(pagina.usuarios[0].ultimoLogin); assert.equal(pagina.usuarios[0].emailConfirmado,true);
  assert.equal((await admin.agente.get('/api/usuarios?ordenacao=criado_em;DROP')).status,400);
  assert.equal((await admin.agente.get('/api/usuarios?emailConfirmado=talvez')).status,400);
  const professor=await sessao("filtro-0@example.com");
  assert.equal((await professor.agente.get('/api/usuarios?emailConfirmado=false')).status,403);
});

test("aviso coletivo exclui confirmados, excluidos e pendentes; e transacional, auditado e nao bloqueia",async () => {
  const adminId=await usuario('admin-lote@example.com','admin');
  await pool.execute('UPDATE usuarios SET email_confirmado_em=NOW() WHERE id=?',[adminId]);
  const ids=[];
  for(let i=0;i<4;i++) ids.push(await usuario(`lote-${i}@example.com`,'professor'));
  await pool.execute('UPDATE usuarios SET email_confirmado_em=NOW() WHERE id=?',[ids[1]]);
  await pool.execute('UPDATE usuarios SET excluido_em=NOW() WHERE id=?',[ids[2]]);
  await pool.execute('INSERT INTO cadastros_email_pendentes(usuario_id) VALUES (?)',[ids[3]]);
  const admin=await sessao('admin-lote@example.com');
  const prof=await sessao('lote-0@example.com');
  const rota='/api/usuarios/solicitar-confirmacao-email';
  assert.equal((await request(aplicacao).post(rota).send({confirmar:true})).status,401);
  assert.equal((await prof.agente.post(rota).set('X-CSRF-Token',prof.csrf).send({confirmar:true})).status,403);
  assert.equal((await admin.agente.post(rota).send({confirmar:true})).status,403);
  assert.equal((await admin.agente.post(rota).set('X-CSRF-Token',admin.csrf).send({})).status,400);
  const repo=require('../src/modules/usuarios/usuarioRepository')(pool);
  const service=require('../src/modules/usuarios/usuarioService')({usuarioRepository:repo,auditoriaRepository:{registrar:async()=>{throw Error('auditoria QA indisponivel');}}});
  await assert.rejects(service.solicitarConfirmacaoEmLote({id:adminId},{confirmar:true}),/auditoria QA/);
  const [[antes]]=await pool.execute('SELECT COUNT(*) n FROM lembretes_email'); assert.equal(antes.n,0);
  for(let i=0;i<2;i++) {
    const r=await admin.agente.post(rota).set('X-CSRF-Token',admin.csrf).send({confirmar:true});
    assert.equal(r.status,200,JSON.stringify(r.body)); assert.equal(r.body.quantidade,1);
  }
  const [avisos]=await pool.execute('SELECT usuario_id FROM lembretes_email');
  assert.deepEqual(avisos.map(x=>Number(x.usuario_id)),[ids[0]]);
  const me=await prof.agente.get('/api/autenticacao/me');
  assert.equal(me.status,200); assert.equal(me.body.usuario.emailPrecisaRevisao,true);
  const [[auditoria]]=await pool.execute("SELECT COUNT(*) n FROM auditoria_geral WHERE acao='confirmacao_email_solicitada_em_lote'"); assert.equal(auditoria.n,2);
  const [[emails]]=await pool.execute('SELECT COUNT(*) n FROM confirmacoes_email'); assert.equal(emails.n,0);
});

test("admin cria, pesquisa e filtra usuarios sem expor campos internos", async function testarUsuarios() {
  const adminId = await usuario("admin-f7@example.com", "admin");
  const admin = await sessao("admin-f7@example.com");
  const semCsrf = await admin.agente.post("/api/usuarios").send({ nome: "Novo Professor", email: "novo@gmail.com", senha: senha, papel: "professor" });
  assert.equal(semCsrf.status, 403);
  const criado = await admin.agente.post("/api/usuarios").set("X-CSRF-Token", admin.csrf).send({ nome: "Novo Professor", email: "novo@gmail.com", senha: senha, papel: "professor" });
  assert.equal(criado.status, 201);
  assert.equal(Object.hasOwn(criado.body.usuario, "senhaHash"), false);
  const filtrados = await admin.agente.get("/api/usuarios?busca=novo&papel=professor&ativo=true&limite=10&pagina=1");
  assert.equal(filtrados.status, 200);
  assert.equal(filtrados.body.usuarios.length, 1);
  assert.equal(filtrados.body.paginacao.total, 1);
  assert.equal(JSON.stringify(filtrados.body).includes("senha_hash"), false);
  assert.equal((await admin.agente.get("/api/usuarios?limite=101")).status, 400);
  assert.equal((await admin.agente.get("/api/usuarios?busca=%27%20OR%201%3D1--")).body.paginacao.total, 0);
  const massa = await admin.agente.patch("/api/usuarios/" + criado.body.usuario.id).set("X-CSRF-Token", admin.csrf).send({ nome: "Outro Nome", email: "x@example.com", ativo: false });
  assert.equal(massa.status, 400);
  assert.equal((await admin.agente.patch("/api/usuarios/999999").set("X-CSRF-Token", admin.csrf).send({ nome: "Conta Ausente", email: "ausente@example.com" })).status, 404);
  assert.equal((await admin.agente.post("/api/usuarios/" + criado.body.usuario.id + "/redefinicao-senha").set("X-CSRF-Token", admin.csrf).send({})).status, 200);
  const proprioPapel = await admin.agente.patch("/api/usuarios/" + adminId + "/papel").set("X-CSRF-Token", admin.csrf).send({ papel: "aluno" });
  assert.equal(proprioPapel.status, 409);
  assert.equal((await admin.agente.patch("/api/usuarios/" + adminId + "/ativo").set("X-CSRF-Token", admin.csrf).send({ ativo: false })).status, 409);
  const professor = await sessao("novo@gmail.com");
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
  assert.equal(painel.body.engajamento.alunosComNavegacao, 1);
  assert.equal(painel.body.engajamento.alunosComMaterial, 1);
  assert.equal(painel.body.engajamento.taxaDeInteracao, 100);
  assert.equal(painel.body.engajamento.buscas, 1);
  assert.equal(painel.body.evolucaoMensal.reduce((total, mes) => total + mes.acessos, 0), 1);
  assert.equal(painel.body.termosMaisPesquisados[0].termo, "material analytics");
  assert.equal(painel.body.pastasMaisAcessadas[0].nome, "ANALYTICS_F7");
  assert.equal((await aluno.agente.get("/api/analytics")).status, 403);
  assert.equal((await admin.agente.get("/api/analytics?periodo=999")).status, 400);
  assert.ok(adminId > 0);
});

test("analytics exclui equipe, preserva perfil no evento, legado e segmentacao apos retencao", async () => {
  const repository = require("../src/modules/analytics/analyticsRepository")(pool);
  const service = require("../src/modules/analytics/analyticsService")(repository);
  const [pasta] = await pool.execute("INSERT INTO categorias(nome,drive_pasta_id) VALUES ('Pasta QA','analytics-qa')");
  const [material] = await pool.execute("INSERT INTO materiais(drive_file_id,categoria_id,nome,mime_type,tipo,extensao) VALUES ('analytics-pdf',?,'QA.pdf','application/pdf','pdf','pdf')", [pasta.insertId]);
  const ids = {};
  for (const papel of ["aluno", "admin", "professor"]) {
    ids[papel] = await usuario(papel + "-segmentacao@example.invalid", papel);
    await repository.registrarConsulta(ids[papel], pasta.insertId, null, papel + "-acesso", "acesso");
    await repository.registrarConsulta(ids[papel], pasta.insertId, "=formula-qa", papel + "-busca", "busca");
    for (const tipo of ["visualizacao", "download"]) await repository.registrarUso({ id: ids[papel], papel }, material.insertId, tipo, papel + tipo);
  }
  // Mudancas futuras de perfil nao podem reclassificar eventos novos.
  await pool.execute("UPDATE usuarios SET papel='professor' WHERE id=?", [ids.aluno]);
  await pool.execute("UPDATE usuarios SET papel='aluno' WHERE id=?", [ids.admin]);
  const antes = await service.obterPainel({ periodo: 30 });
  assert.equal(antes.publico, "aluno");
  assert.equal(antes.evolucao[0].acessos, 1);
  assert.equal(antes.evolucao[0].visualizacoes, 1);
  assert.equal(antes.evolucao[0].downloads, 1);
  assert.equal(antes.evolucao[0].alunosAtivos, 1);
  assert.equal(antes.engajamento.alunosComNavegacao, 1);
  assert.equal(antes.engajamento.taxaDeInteracao, 100);
  assert.equal(antes.termosMaisPesquisados[0].quantidade, 1);
  assert.equal(antes.pastasMaisAcessadas[0].quantidade, 1);
  assert.equal(antes.materiaisMaisUsados[0].acessos, 2);
  const [[quantidade]] = await pool.query("SELECT COUNT(*) n FROM eventos_uso_acervo");
  assert.equal(Number(quantidade.n), 12); // Nao descartou a atividade da equipe.
  await pool.execute("INSERT INTO analytics_resumo_diario(dia,acessos,visualizacoes,downloads) VALUES (DATE_SUB(CURRENT_DATE,INTERVAL 20 DAY),99,88,77)");
  const [legadoAntes] = await pool.query("SELECT * FROM analytics_resumo_diario");
  await pool.execute("UPDATE eventos_uso_acervo SET criado_em=DATE_SUB(CURRENT_DATE,INTERVAL 10 DAY)");
  await service.executarRetencao({ retencaoEventosDias: 5, loteRetencao: 100 });
  const depois = await service.obterPainel({ periodo: 30 });
  assert.equal(depois.evolucao.length, 1);
  assert.equal(depois.evolucao[0].acessos, 1);
  assert.equal(depois.evolucao[0].visualizacoes, 1);
  assert.equal(depois.evolucao[0].downloads, 1);
  assert.equal(depois.evolucao[0].alunosAtivos, 1);
  assert.equal(depois.termosMaisPesquisados[0].quantidade, 1);
  assert.equal(depois.pastasMaisAcessadas[0].quantidade, 1);
  assert.equal(depois.materiaisMaisUsados[0].acessos, 2);
  assert.equal(depois.cobertura.engajamentoParcial, true);
  assert.equal(depois.cobertura.historicoSemSegmentacao[0].navegacoes, 99);
  const [legadoDepois] = await pool.query("SELECT * FROM analytics_resumo_diario WHERE navegacoes_alunos IS NULL");
  assert.deepEqual(legadoDepois, legadoAntes);
  const [[totais]] = await pool.query("SELECT acessos FROM analytics_resumo_diario WHERE navegacoes_alunos IS NOT NULL");
  assert.equal(Number(totais.acessos), 3);
  await service.executarRetencao({ retencaoEventosDias: 5, loteRetencao: 100 });
  assert.deepEqual((await service.obterPainel({ periodo: 30 })).evolucao, depois.evolucao);
  assert.equal((await service.obterPainel({ periodo: 7 })).evolucao.length, 0);
  const csv = await service.gerarCsv({ periodo: 30 });
  assert.ok(csv.includes("'=")); // Termos livres nunca executam formula na planilha.
  assert.ok(csv.includes('"99","88","77"'));
});

test("historico registra autoria, filtra, pagina e nao oferece mutacao", async function testarAuditoria() {
  await usuario("admin-auditoria@example.com", "admin");
  const admin = await sessao("admin-auditoria@example.com");
  await admin.agente.post("/api/usuarios").set("X-CSRF-Token", admin.csrf).send({ nome: "Usuario Auditado", email: "auditado@gmail.com", senha: senha, papel: "aluno" });
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
