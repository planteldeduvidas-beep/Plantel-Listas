const { PESOS, CANARIO, caminho, escopo, critica, classificar, criarIdentidade } = require("./politicaDefesa");
const criarRepository = require("./defesaRepository");

function criarDefesaService({ pool, configuracao, logger, emailProvider, repository, relogio = Date.now }) {
  const cfg = configuracao.defesa;
  const identidade = criarIdentidade(cfg.chaveEvidencia);
  const repo = repository || criarRepository(pool, cfg, identidade);
  let estados = new Map();
  let contencao = false;
  let timer;
  let atualizando;
  const alertasPendentes = new Set();
  const enviosPorSeveridade = { HIGH: 0, CRITICAL: 0 };
  let ultimaFalhaLog = -Infinity;
  const pendentes = new Set();
  const amostras = new Map();
  let segundo = 0;
  let admitidos = 0;
  let minuto = 0;
  let admitidosMinuto = 0;
  const chave = evento => evento.sujeito + ":" + evento.escopo;

  function falha(codigo) {
    if (relogio() - ultimaFalhaLog >= 60000) {
      ultimaFalhaLog = relogio();
      logger?.warn({ codigo }, "Camada defensiva degradada; controles originais permanecem ativos");
    }
  }
  async function atualizar() {
    if (atualizando) return atualizando;
    atualizando = (async () => {
      const inicio = relogio();
      const dados = await repo.carregar(inicio);
      const novos = new Map(dados.estados.map(e => [chave(e), e]));
      for (const [id, e] of estados) if (e.localEm >= inicio) novos.set(id, e);
      estados = novos;
      contencao = dados.contencao;
    })();
    try { await atualizando; } finally { atualizando = null; }
  }
  async function iniciar() {
    await atualizar();
    if (!timer) {
      timer = setInterval(() => { void atualizar().catch(() => falha("SECURITY_REFRESH_FAILED")); }, cfg.refreshMs);
      timer.unref();
    }
  }
  async function parar() {
    clearInterval(timer); timer = null;
    await Promise.allSettled([...pendentes, atualizando].filter(Boolean));
    // Uma persistencia pendente pode iniciar SMTP durante a primeira espera.
    await Promise.allSettled([...alertasPendentes]);
  }
  function resposta(req, res, ate, status = 429) {
    res.set("Cache-Control", "no-store");
    res.set("Retry-After", String(Math.max(1, Math.ceil((ate - relogio()) / 1000))));
    res.status(status).json({ erro: { codigo: "OPERACAO_TEMPORARIAMENTE_INDISPONIVEL", mensagem: "Operacao temporariamente indisponivel. Tente novamente mais tarde." } });
  }
  function verificar(req, res) {
    if (caminho(req) === "/api/autenticacao/logout") return false;
    if (contencao && critica(req)) { resposta(req, res, relogio() + cfg.refreshMs, 503); return true; }
    const evento = identidade.preparar(req, "", relogio());
    const atual = estados.get(chave(evento));
    const ate = Math.max(Number(atual?.bloquear_ate_ms || 0), Number(atual?.limitar_ate_ms || 0));
    if (ate > relogio()) { resposta(req, res, ate); return true; }
    if (atual) estados.delete(chave(evento));
    return false;
  }
  function alertar(evento, resultado) {
    if (!resultado.alerta || !cfg.destinatario || !emailProvider?.enviarAlertaSeguranca) return;
    const severidade = resultado.severidade === "CRITICAL" ? "CRITICAL" : "HIGH";
    const teto = severidade === "CRITICAL" ? cfg.alertaTetoCritical : cfg.alertaTetoHigh;
    if (enviosPorSeveridade[severidade] >= teto) { falha("SECURITY_ALERT_CAPACITY"); return; }
    enviosPorSeveridade[severidade]++;
    // Envios independentes e limitados; HIGH nao ocupa capacidade local CRITICAL.
    const envio = Promise.resolve().then(() => emailProvider.enviarAlertaSeguranca({
      destinatario: cfg.destinatario,
      texto: ["PLANTEL SECURITY", "Severidade: " + severidade, "Evento: " + evento.tipo, "Quantidade: " + resultado.quantidade,
        "Janela (min): " + cfg.janelaMs / 60000, "Resposta: bloqueio temporario aplicado",
        "Regra: " + resultado.regra, "Origem tecnica: " + evento.ip,
        "Usuario interno: " + (evento.usuarioId || "anonimo"), "Request: " + (evento.requestId || "indisponivel"),
        "Rota: " + evento.rota, "Nao representa atribuicao de identidade civil."].join("\n")
    })).catch(() => falha("SECURITY_ALERT_FAILED")).finally(() => {
      alertasPendentes.delete(envio); enviosPorSeveridade[severidade]--;
    });
    alertasPendentes.add(envio);
  }
  async function registrar(req, tipo) {
    if (!Object.hasOwn(PESOS, tipo) || req.eventoDefesaRegistrado) return;
    req.eventoDefesaRegistrado = true;
    const agora = relogio();
    const evento = identidade.preparar(req, tipo, agora);
    const id = chave(evento);
    const atual = estados.get(id);
    if (Math.max(Number(atual?.bloquear_ate_ms || 0), Number(atual?.limitar_ate_ms || 0)) > agora) return;
    // Map finito, amostragem e concorrencia limitada: defesa nao esgota o pool.
    if (Math.floor(agora / 1000) !== segundo) { segundo = Math.floor(agora / 1000); admitidos = 0; }
    if (Math.floor(agora / 60000) !== minuto) { minuto = Math.floor(agora / 60000); admitidosMinuto = 0; }
    if (agora - (amostras.get(id) ?? -Infinity) < 250) return;
    if (pendentes.size >= 4 || admitidos >= 20 || admitidosMinuto >= cfg.eventosPorMinuto) { falha("SECURITY_EVENT_SAMPLED"); return; }
    if (amostras.size >= 10000) amostras.delete(amostras.keys().next().value);
    amostras.set(id, agora); admitidos++; admitidosMinuto++;
    const tarefa = (async () => {
      const resultado = await repo.registrar(evento);
      if (Number(resultado.bloquear_ate_ms) > agora || Number(resultado.limitar_ate_ms) > agora) {
        if (estados.size >= 10000) falha("SECURITY_CACHE_CAPACITY");
        else estados.set(id, { ...resultado, localEm: relogio() });
      }
      alertar(evento, resultado);
    })().catch(() => falha("SECURITY_PERSISTENCE_FAILED"));
    pendentes.add(tarefa);
    tarefa.finally(() => pendentes.delete(tarefa));
    let timeout;
    try { await Promise.race([tarefa, new Promise(resolve => { timeout = setTimeout(resolve, 2500); })]); }
    finally { clearTimeout(timeout); }
  }
  async function registrarErro(req, codigo, status) {
    const tipo = classificar(req, codigo, status);
    if (tipo) await registrar(req, tipo);
  }
  async function entrada(req, res, next) {
    const rota = caminho(req);
    // IP so nos fluxos publicos; usuario valido atras de NAT usa a propria identidade.
    if ((escopo(req) !== "app" || rota === CANARIO) && verificar(req, res)) return;
    if (rota === CANARIO) {
      await registrar(req, "HONEYPOT_TRIGGERED");
      return res.status(404).set("Cache-Control", "no-store").json({ erro: { codigo: "ROTA_NAO_ENCONTRADA", mensagem: "Rota nao encontrada" } });
    }
    next();
  }
  return { iniciar, parar, atualizar, registrar, registrarErro, verificar, entrada };
}
module.exports = criarDefesaService;
