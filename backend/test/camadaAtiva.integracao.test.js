const test = require("node:test");
const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const request = require("supertest");
const pino = require("pino");
const crypto = require("node:crypto");
const criarApp = require("../src/app");
const { obterConfiguracao, validarVariaveisDeAmbiente } = require("../src/shared/config/ambiente");
const { criarPool } = require("../src/shared/database/conexao");
const { criarEmailProviderFake } = require("../src/shared/providers/emailProvider");
const criarService = require("../src/modules/seguranca/defesaService");
const criarRepo = require("../src/modules/seguranca/defesaRepository");
const { criarIdentidade, classificar, critica, PESOS } = require("../src/modules/seguranca/politicaDefesa");
const { gerarHashDoToken } = require("../src/shared/utils/tokens");
const base = obterConfiguracao();
const bancoTeste = process.env.DB_TEST_NAME || base.banco.nome + "_test";
assert.notEqual(bancoTeste, base.banco.nome);
assert.ok(["localhost", "127.0.0.1"].includes(base.banco.host), "Somente MySQL local");
const pool = criarPool({ ...base.banco, nome: bancoTeste });
const cfg = { ...base, ambiente: "test", googleDrive: {},
  seguranca: { ...base.seguranca, limiteAutenticacao: 100 },
  // Limiares/TTLs reduzidos exclusivamente na fixture para poucos requests deterministas.
  defesa: { ...base.defesa, chaveEvidencia: crypto.randomBytes(32).toString("hex"), habilitada: true, suspeito: 5, limite: 10, bloqueio: 20,
    enumeracao: 5, fatorAnonimo: 2, janelaMs: 60000, pausaMs: 1000, bloqueioMs: 5000, destinatario: "security@example.com" }
};
const identidade = criarIdentidade(cfg.defesa.chaveEvidencia);
const repo = criarRepo(pool, cfg.defesa, identidade);
const logger = pino({ level: "silent" });
let agora, services, criados;
function req(id = 101, url = "/api/usuarios", ip = "192.0.2.1") {
  return { id: crypto.randomUUID(), usuario: id ? { id, papel: "aluno" } : undefined,
    ip, originalUrl: url, method: "GET", headers: { "user-agent": "Chrome SENTINELA_UA" } };
}
function res() { return { statusCode: null, set() { return this; }, status(n) { this.statusCode=n; return this; }, json(v) { this.body=v; return this; } }; }
function service(extra = {}) {
  const svc = criarService({ pool, configuracao: cfg, logger, emailProvider: criarEmailProviderFake(), relogio: () => agora, ...extra });
  services.push(svc); return svc;
}
async function emitir(svc, usuario, tipo, rota) { agora += 1200; await svc.registrar(req(usuario, rota), tipo); }
test.beforeEach(async () => {
  agora = Date.now(); services = []; criados = [];
  await pool.execute("DELETE FROM seguranca_eventos");
  await pool.execute("DELETE FROM seguranca_agregados");
  await pool.execute("DELETE FROM seguranca_alerta_incidentes");
  await pool.execute("UPDATE seguranca_alerta_cotas SET janela_ms=0,quantidade=0");
  await pool.execute("UPDATE seguranca_controle SET contencao=0,proximo_alerta_ms=0 WHERE id=1");
});
test.afterEach(async () => {
  await Promise.all(services.map(s => s.parar()));
  for (const id of criados) { await pool.execute("DELETE FROM sessoes WHERE usuario_id=?", [id]); await pool.execute("DELETE FROM usuarios WHERE id=?", [id]); }
});
test.after(async () => {
  await pool.execute("DELETE FROM seguranca_alerta_incidentes");
  await pool.execute("UPDATE seguranca_alerta_cotas SET janela_ms=0,quantidade=0");
  await pool.execute("DELETE FROM seguranca_eventos"); await pool.execute("DELETE FROM seguranca_agregados");
  await pool.execute("UPDATE seguranca_controle SET contencao=0,proximo_alerta_ms=0 WHERE id=1"); await pool.end();
});

test("classifica falhas relevantes sem contar inicializacao, provider ou erro isolado como ataque", async () => {
  const svc = service();
  const casos = [["CREDENCIAIS_INVALIDAS",401,"AUTH_FAILURE"], ["SEM_PERMISSAO",403,"ADMIN_ACCESS_DENIED"],
    ["CSRF_INVALIDO",403,"CSRF_FAILURE"], ["UPLOAD_INVALIDO",400,"INVALID_UPLOAD"],
    ["GOOGLE_WEBHOOK_INVALIDO",403,"INVALID_WEBHOOK"], ["LIMITE_UPLOAD",429,"RATE_LIMIT_TRIGGERED"]];
  for (let i=0;i<casos.length;i++) {
    const [codigo,status,tipo]=casos[i]; const r=req(200+i);
    assert.equal(classificar(r,codigo,status),tipo);
    await svc.registrarErro(r,codigo,status);
    assert.equal(svc.verificar(req(200+i),res()),false);
  }
  assert.equal(classificar(req(null,"/api/autenticacao/me"),"NAO_AUTENTICADO",401),null);
  assert.equal(classificar(req(),"GOOGLE_PERMISSAO_NEGADA",403),null);
  const [eventos] = await pool.execute("SELECT COUNT(*) n FROM seguranca_eventos"); assert.equal(Number(eventos[0].n),6);
});

test("padrao escala, bloqueia antes da operacao, isola usuario/NAT e expira sem renovar TTL", async () => {
  const svc=service(); await svc.atualizar();
  for(let i=0;i<3;i++)await emitir(svc,101,"ADMIN_ACCESS_DENIED");
  assert.equal(svc.verificar(req(),res()),true); // pausa em 12 pontos
  agora+=1200;
  assert.equal(svc.verificar(req(),res()),false);
  await emitir(svc,101,"ADMIN_ACCESS_DENIED"); await emitir(svc,101,"ADMIN_ACCESS_DENIED");
  let operacoes=0; if(!svc.verificar(req(),res()))operacoes++;
  assert.equal(operacoes,0);
  assert.equal(svc.verificar(req(102),res()),false);
  assert.equal(svc.verificar(req(101,"/api/usuarios","192.0.2.88"),res()),true); // trocar IP nao contorna user
  assert.equal(svc.verificar(req(101,"/api/autenticacao/logout"),res()),false);
  const [antes]=await pool.execute("SELECT bloquear_ate_ms FROM seguranca_agregados");
  await emitir(svc,101,"ADMIN_ACCESS_DENIED");
  const [depois]=await pool.execute("SELECT bloquear_ate_ms FROM seguranca_agregados");
  assert.equal(antes[0].bloquear_ate_ms,depois[0].bloquear_ate_ms);
  agora=Number(antes[0].bloquear_ate_ms)+1; assert.equal(svc.verificar(req(),res()),false);
  await emitir(svc,101,"ADMIN_ACCESS_DENIED");assert.equal(svc.verificar(req(),res()),false);
});

test("persistencia e concorrencia mantem bloqueio em restart e notificam incidentes independentes", async () => {
  const email=criarEmailProviderFake(); const svc=service({emailProvider:email});
  const evento=identidade.preparar(req(),"ADMIN_ACCESS_DENIED",agora);
  // Ultrapassa pausa somente apos o TTL; transacoes concorrentes nao perdem contagem.
  await Promise.all([repo.registrar(evento),repo.registrar(evento),repo.registrar(evento)]);
  agora+=1200;
  await emitir(svc,101,"ADMIN_ACCESS_DENIED"); await emitir(svc,101,"ADMIN_ACCESS_DENIED");
  const segunda=service(); await segunda.atualizar(); assert.equal(segunda.verificar(req(),res()),true);
  const reiniciada=service(); await reiniciada.iniciar(); assert.equal(reiniciada.verificar(req(),res()),true);
  for(let i=0;i<5;i++)await emitir(svc,102,"ADMIN_ACCESS_DENIED");
  await svc.parar(); assert.equal(email.obterMensagens().length,2);
  assert.equal(email.obterMensagens()[0].texto.includes("SENTINELA"),false);
  const [ev]=await pool.execute("SELECT tipo FROM seguranca_eventos WHERE tipo='TEMPORARY_BLOCK'"); assert.equal(ev.length,2);
});

test("enumeracao exige IDs recusados distintos no mesmo recurso; pagina e sucesso nao contam", async () => {
  const svc=service();
  for(let i=0;i<5;i++)await emitir(svc,101,"RESOURCE_ENUMERATION","/api/acervo/materiais/937/conteudo");
  assert.equal(svc.verificar(req(),res()),false);
  for(let i=100;i<105;i++)await emitir(svc,102,"RESOURCE_ENUMERATION","/api/acervo/materiais/"+i+"/conteudo");
  assert.equal(svc.verificar(req(102),res()),true);
  for(let i=0;i<8;i++) await svc.registrarErro(req(103,"/api/acervo?pagina="+i),"",200);
  const [normal]=await pool.execute("SELECT * FROM seguranca_agregados WHERE sujeito=?",[identidade.preparar(req(103),"",agora).sujeito]);
  assert.equal(normal.length,0);
});

test("alertas deduplicam incidente, respeitam teto concorrente e reservam capacidade CRITICAL", async () => {
  const limitado = criarRepo(pool, {...cfg.defesa, bloqueio: 4, alertaTetoHigh: 2, alertaTetoCritical: 1}, identidade);
  const evento = (id, tipo = "HONEYPOT_TRIGGERED", severidade) => ({...identidade.preparar(req(id),tipo,agora),severidade});
  assert.equal((await limitado.registrar(evento(301))).alerta,true);
  agora += 6000; // TTL acabou, mas cooldown do mesmo incidente nao.
  assert.equal((await limitado.registrar(evento(301))).alerta,false);
  const concorrentes = await Promise.all([302,303,304].map(id=>limitado.registrar(evento(id))));
  assert.equal(concorrentes.filter(r=>r.alerta).length,1);
  // Mesmo incidente escalado a CRITICAL nao usa a cota HIGH esgotada.
  agora += 6000;
  assert.equal((await limitado.registrar(evento(301,"HONEYPOT_TRIGGERED","CRITICAL"))).alerta,true);
  assert.equal((await limitado.registrar(evento(305,"HONEYPOT_TRIGGERED","CRITICAL"))).alerta,false);
  agora += cfg.defesa.alertaCooldownMs;
  assert.equal((await limitado.registrar(evento(301))).alerta,true);
  agora += 6000;
  assert.equal((await limitado.registrar(evento(301,"ADMIN_ACCESS_DENIED"))).alerta,true);
});

test("chave de evidencia independente preserva assinatura e sujeito apos rotacao CSRF", async () => {
  const outraCfg = {...cfg,seguranca:{...cfg.seguranca,csrfSecret:crypto.randomBytes(32).toString("hex")}};
  const outra = criarIdentidade(outraCfg.defesa.chaveEvidencia);
  const texto = JSON.stringify(identidade.preparar(req(301),"AUTH_FAILURE",agora));
  assert.equal(outra.verificar(texto,identidade.assinar(texto)),true);
  assert.equal(outra.preparar(req(301),"",agora).sujeito,identidade.preparar(req(301),"",agora).sujeito);
  assert.throws(()=>criarIdentidade(""),/SECURITY_EVIDENCE_KEY/);
});

test("evidencia nao copia secrets/payload/rota livre, HMAC detecta adulteracao e retencao e limitada", async () => {
  const svc=service(); const r=req(101,"/api/usuarios/SENTINELA_ROTA?token=SENTINELA_QUERY");
  r.headers.authorization="SENTINELA_AUTH"; r.headers.cookie="SENTINELA_COOKIE"; r.body={senha:"SENTINELA_PASSWORD"};
  await svc.registrar(r,"ACCESS_DENIED");
  const [linhas]=await pool.execute("SELECT evidencia,assinatura FROM seguranca_eventos");
  assert.equal(linhas[0].evidencia.includes("SENTINELA"),false);
  assert.equal(identidade.verificar(linhas[0].evidencia,linhas[0].assinatura),true);
  assert.equal(identidade.verificar(linhas[0].evidencia+" ",linhas[0].assinatura),false);
  await pool.execute("UPDATE seguranca_eventos SET criado_em=DATE_SUB(NOW(),INTERVAL 181 DAY)");
  assert.equal((await repo.limpar(agora)).eventos,1);
});

test("canario nao executa negocio; abuso publico bloqueia antes do controller e preserva webhook de outro escopo", async () => {
  const svc=service();
  let proximos=0;
  for(let i=0;i<4;i++){agora+=1200;await svc.entrada(req(null,"/api/_security/canary"),res(),()=>proximos++);}
  assert.equal(proximos,0);
  const bloqueado=res();await svc.entrada(req(null,"/api/_security/canary"),bloqueado,()=>proximos++);
  assert.equal(bloqueado.statusCode,429);
  assert.equal(svc.verificar(req(null,"/api/integracoes/google-drive/webhook"),res()),false);
  assert.equal(svc.verificar(req(101),res()),false);
  // Bloqueio de auth vem do mesmo agregado persistente, antes do parser/controller.
  const auth=identidade.preparar(req(null,"/api/autenticacao/login"),"RATE_LIMIT_TRIGGERED",agora);
  await pool.execute("INSERT INTO seguranca_agregados (sujeito,escopo,janela_ms,ultimo_ms,recursos,bloquear_ate_ms) VALUES (?,?,?,?,?,?)",
    [auth.sujeito,"auth",agora,agora,"[]",agora+5000]);
  await svc.atualizar();const negado=res();
  await svc.entrada({...req(null,"/api/autenticacao/login"),method:"POST"},negado,()=>proximos++);
  assert.equal(negado.statusCode,429);assert.equal(proximos,0);
});

test("contencao e manual, auditada e impede operacoes criticas preservando leitura/logout/upload", async () => {
  const svc=service();await svc.atualizar();
  const mutacao={...req(101,"/api/usuarios/1/papel"),method:"PATCH"};
  assert.equal(svc.verificar(mutacao,res()),false);
  await repo.alterarContencao(true,"operador-teste",agora);await svc.atualizar();
  const r=res();assert.equal(svc.verificar(mutacao,r),true);assert.equal(r.statusCode,503);
  assert.equal(svc.verificar(req(),res()),false);
  assert.equal(critica({...req(101,"/api/gestao-materiais"),method:"POST"}),false);
  assert.equal(critica(req(101,"/api/integracoes/google-drive/oauth/callback")),true);
  assert.equal(critica({...req(101,"/api/gestao-materiais/99"),method:"DELETE"}),true);
  assert.equal(critica({...req(101,"/api/gestao-materiais/%39%39"),method:"DELETE"}),true);
  await repo.alterarContencao(false,"operador-teste",agora);await svc.atualizar();assert.equal(svc.verificar(mutacao,res()),false);
  const [ev]=await pool.execute("SELECT * FROM seguranca_eventos WHERE tipo='CONTAINMENT_CHANGED'");assert.equal(ev.length,2);
});

test("caminho HTTP completo usa sessao real e bloqueia escrita com CSRF valido antes do service", async () => {
  const [u]=await pool.execute("INSERT INTO usuarios(nome,email,senha_hash,papel) VALUES ('Defesa','defesa-teste@example.com','hash-nao-usado','admin')");
  criados.push(Number(u.insertId));
  const token=crypto.randomBytes(32).toString("hex");
  await pool.execute("INSERT INTO sessoes(usuario_id,usuario_versao,token_hash,expira_em) VALUES (?,1,?,DATE_ADD(NOW(),INTERVAL 1 HOUR))",[u.insertId,gerarHashDoToken(token)]);
  const app=criarApp(cfg,logger,{pool,emailProvider:criarEmailProviderFake(),ativarDefesaEmTeste:true,relogioDefesa:()=>agora});
  services.push(app.locals.defesaAtiva);await app.locals.defesaAtiva.iniciar();
  const agente=request.agent(app);const csrf=(await agente.get("/api/autenticacao/csrf")).body.csrfToken;
  const cookie=cfg.seguranca.nomeCookieSessao+"="+token;
  assert.equal((await agente.get("/api/autenticacao/me").set("Cookie",cookie)).status,200);
  for(let i=0;i<10;i++){
    agora+=1200;
    const resposta=await agente.post("/api/avisos").set("Cookie",cookie).send({texto:"Nao criar"});
    assert.equal(resposta.status,403);
  }
  const antes=await pool.execute("SELECT COUNT(*) n FROM avisos_biblioteca");
  const resposta=await agente.post("/api/avisos").set("Cookie",cookie).set("X-CSRF-Token",csrf).send({texto:"Nao criar",ativo:true,ordem:0});
  assert.equal(resposta.status,429);
  const depois=await pool.execute("SELECT COUNT(*) n FROM avisos_biblioteca");assert.equal(antes[0][0].n,depois[0][0].n);
  // Expirou: leitura volta, sem intervenção administrativa.
  agora+=6000;assert.equal((await agente.get("/api/autenticacao/me").set("Cookie",cookie)).status,200);
});

test("cache nao consulta banco no uso normal e falha de persistencia nao derruba controles originais", async t => {
  let leituras=0,escritas=0;const logs=[];
  const svc=service({logger:{warn:obj=>logs.push(obj)},repository:{carregar:async()=>{leituras++;return{estados:[],contencao:false};},registrar:async()=>{escritas++;throw new Error("SENTINELA_PRIVADA");}}});
  await svc.atualizar();const inicio=performance.now();
  for(let i=0;i<200;i++)assert.equal(svc.verificar(req(101),res()),false);
  t.diagnostic("200 verificacoes locais: "+(performance.now()-inicio).toFixed(2)+" ms; queries adicionais: "+(leituras-1));
  assert.equal(leituras,1);assert.equal(escritas,0);
  await svc.registrar(req(),"ACCESS_DENIED");assert.equal(escritas,1);assert.equal(JSON.stringify(logs).includes("SENTINELA"),false);
  assert.equal(svc.verificar(req(),res()),false);
  // Flood curto de mesma origem e amostrado, sem fila ilimitada.
  await Promise.all(Array.from({length:8},()=>svc.registrar(req(),"ACCESS_DENIED")));assert.equal(escritas,1);
  const cfgLimitada={...cfg,defesa:{...cfg.defesa,eventosPorMinuto:2}};
  let gravados=0;
  const limitado=service({configuracao:cfgLimitada,repository:{carregar:async()=>({estados:[],contencao:false}),registrar:async()=>{gravados++;return{};}}});
  await Promise.all([1,2,3,4,5].map(i=>limitado.registrar(req(900+i),"ACCESS_DENIED")));
  assert.equal(gravados,2);
  let indisponivel = false;
  const conhecido = identidade.preparar(req(701),"",agora);
  const cachePreservado = service({repository:{carregar:async()=>{
    if (indisponivel) throw new Error("falha simulada");
    return {estados:[{...conhecido,bloquear_ate_ms:agora+5000}],contencao:false};
  }}});
  await cachePreservado.atualizar();indisponivel=true;
  await assert.rejects(()=>cachePreservado.atualizar());
  assert.equal(cachePreservado.verificar(req(701),res()),true);
  assert.equal(cachePreservado.verificar(req(702),res()),false);
  agora+=6000;assert.equal(cachePreservado.verificar(req(701),res()),false);
});
