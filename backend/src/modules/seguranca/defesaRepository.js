const { PESOS } = require("./politicaDefesa");
function criarDefesaRepository(pool, configuracao, identidade) {
  const cfg = configuracao;
  async function executar(conexao, sql, valores = []) {
    return conexao.execute({ sql, timeout: 2000 }, valores);
  }
  async function transacao(tarefa) {
    const conexao = await pool.getConnection();
    try {
      await conexao.beginTransaction();
      const resultado = await tarefa(conexao);
      await conexao.commit();
      return resultado;
    } catch (erro) {
      await conexao.rollback().catch(() => {});
      throw erro;
    } finally { conexao.release(); }
  }
  async function gravar(conexao, evento) {
    const texto = JSON.stringify(evento);
    await executar(conexao, "INSERT INTO seguranca_eventos (sujeito,tipo,severidade,evidencia,assinatura) VALUES (?,?,?,?,?)",
      [evento.sujeito, evento.tipo, evento.severidade, texto, identidade.assinar(texto)]);
  }
  async function reservarAlerta(conexao, evento, regra, severidade) {
    // Ordem fixa de locks: cota da severidade, depois incidente. HIGH nunca
    // consome a reserva CRITICAL. Limite global por janela de cooldown.
    const [cotas] = await executar(conexao, "SELECT janela_ms,quantidade FROM seguranca_alerta_cotas WHERE severidade=? FOR UPDATE", [severidade]);
    if (!cotas.length) throw new Error("DEFESA_COTA_AUSENTE");
    const agora = evento.instante;
    const nova = agora - Number(cotas[0].janela_ms) >= cfg.alertaCooldownMs;
    const quantidade = nova ? 0 : Number(cotas[0].quantidade);
    const teto = severidade === "CRITICAL" ? cfg.alertaTetoCritical : cfg.alertaTetoHigh;
    if (quantidade >= teto) return false;
    const chave = identidade.hash(JSON.stringify([evento.tipo, evento.sujeito, evento.escopo, regra, severidade]));
    const [incidentes] = await executar(conexao, "SELECT expira_ms FROM seguranca_alerta_incidentes WHERE chave=?", [chave]);
    if (Number(incidentes[0]?.expira_ms) > agora) return false;
    await executar(conexao, "INSERT INTO seguranca_alerta_incidentes (chave,expira_ms) VALUES (?,?) ON DUPLICATE KEY UPDATE expira_ms=VALUES(expira_ms)", [chave, agora + cfg.alertaCooldownMs]);
    await executar(conexao, "UPDATE seguranca_alerta_cotas SET janela_ms=?,quantidade=? WHERE severidade=?", [nova ? agora : cotas[0].janela_ms, quantidade + 1, severidade]);
    return true;
  }
  async function registrar(evento) {
    return transacao(async conexao => {
      const agora = evento.instante;
      // UPSERT adquire lock exclusivo; INSERT IGNORE deixava concorrentes com
      // locks compartilhados e podia deadlockar ao promover para FOR UPDATE.
      await executar(conexao, "INSERT INTO seguranca_agregados (sujeito,escopo,janela_ms,ultimo_ms,recursos) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE sujeito=VALUES(sujeito)",
        [evento.sujeito, evento.escopo, agora, agora, "[]"]);
      const [linhas] = await executar(conexao, "SELECT * FROM seguranca_agregados WHERE sujeito=? AND escopo=? FOR UPDATE", [evento.sujeito, evento.escopo]);
      const atual = linhas[0];
      if (Number(atual.bloquear_ate_ms) > agora || Number(atual.limitar_ate_ms) > agora) return { ...atual, alerta: false };
      const novaJanela = agora - Number(atual.janela_ms) >= cfg.janelaMs
        || (Number(atual.bloquear_ate_ms) > 0 && Number(atual.bloquear_ate_ms) <= agora);
      const fator = evento.usuarioId ? 1 : cfg.fatorAnonimo;
      let recursos = novaJanela ? [] : (typeof atual.recursos === "string" ? JSON.parse(atual.recursos) : atual.recursos);
      let pontos = (novaJanela ? 0 : Number(atual.pontos)) + PESOS[evento.tipo];
      const quantidade = (novaJanela ? 0 : Number(atual.quantidade)) + 1;
      if (evento.recurso && ["RESOURCE_ENUMERATION", "ACCESS_DENIED", "ADMIN_ACCESS_DENIED"].includes(evento.tipo)) {
        recursos = [...new Set([...recursos, evento.recurso])].slice(-128);
      }
      const grupo = evento.recurso?.split(":")[0];
      const ordenados = recursos.filter(r => r.split(":")[0] === grupo).map(r => Number(r.split(":")[1])).sort((a,b) => a-b);
      const consecutivos = ordenados.reduce((total, valor, i) => total + (i > 0 && valor === ordenados[i-1]+1 ? 1 : 0), 0);
      const enumeracao = ordenados.length >= cfg.enumeracao * fator && consecutivos >= cfg.enumeracao * fator - 1;
      if (enumeracao) pontos = Math.max(pontos, cfg.bloqueio * fator);
      const bloquear = pontos >= cfg.bloqueio * fator;
      // A pausa curta nao reinicia a janela: persistindo o padrao, escala para bloqueio.
      const pausaAnterior = novaJanela ? 0 : Number(atual.limitar_ate_ms);
      const limitar = !bloquear && !pausaAnterior && pontos >= cfg.limite * fator;
      const bloqueadoAte = bloquear ? agora + cfg.bloqueioMs : 0;
      const limitadoAte = limitar ? agora + cfg.pausaMs : pausaAnterior;
      // Severidade CRITICAL somente de produtor interno explicito; preparar(req)
      // nao aceita esse campo do cliente. Heuristicas atuais continuam HIGH.
      const severidade = bloquear ? (evento.severidade === "CRITICAL" ? "CRITICAL" : "HIGH") : pontos >= cfg.suspeito * fator ? "MEDIUM" : "LOW";
      const regra = enumeracao ? "IDS_RECUSADOS_SEQUENCIAIS" : "REPETICAO_NA_JANELA";
      const resposta = bloquear ? "BLOQUEIO_TEMPORARIO" : limitar ? "PAUSA_TEMPORARIA" : "REGISTRO";
      await executar(conexao, "UPDATE seguranca_agregados SET janela_ms=?,ultimo_ms=?,pontos=?,quantidade=?,recursos=?,limitar_ate_ms=?,bloquear_ate_ms=? WHERE sujeito=? AND escopo=?",
        [novaJanela ? agora : atual.janela_ms, agora, pontos, quantidade, JSON.stringify(recursos), limitadoAte, bloqueadoAte, evento.sujeito, evento.escopo]);
      await gravar(conexao, { ...evento, severidade, pontos, quantidade, regra, resposta, ate: bloqueadoAte || limitadoAte });
      let alerta = false;
      if (bloquear) {
        await gravar(conexao, { ...evento, tipo: "TEMPORARY_BLOCK", severidade, pontos, quantidade, regra, resposta, ate: bloqueadoAte });
        alerta = await reservarAlerta(conexao, evento, regra, severidade);
      }
      return { sujeito: evento.sujeito, escopo: evento.escopo, limitar_ate_ms: limitadoAte, bloquear_ate_ms: bloqueadoAte, alerta, quantidade, regra, severidade };
    });
  }
  async function carregar(agora) {
    const [estados] = await executar(pool, "SELECT sujeito,escopo,limitar_ate_ms,bloquear_ate_ms FROM seguranca_agregados WHERE bloquear_ate_ms>? OR limitar_ate_ms>? LIMIT 10001", [agora, agora]);
    if (estados.length > 10000) throw new Error("DEFESA_CAPACIDADE_EXCEDIDA");
    const [controle] = await executar(pool, "SELECT contencao,(SELECT COUNT(*) FROM seguranca_alerta_cotas WHERE severidade IN ('HIGH','CRITICAL')) AS cotas FROM seguranca_controle WHERE id=1");
    if (!controle.length) throw new Error("DEFESA_CONTROLE_AUSENTE");
    if (Number(controle[0].cotas) !== 2) throw new Error("DEFESA_COTA_AUSENTE");
    return { estados, contencao: Boolean(controle[0].contencao) };
  }
  async function alterarContencao(ativo, ator, agora) {
    return transacao(async conexao => {
      const [linhas] = await executar(conexao, "SELECT contencao FROM seguranca_controle WHERE id=1 FOR UPDATE");
      if (!linhas.length) throw new Error("DEFESA_CONTROLE_AUSENTE");
      await executar(conexao, "UPDATE seguranca_controle SET contencao=? WHERE id=1", [ativo ? 1 : 0]);
      await gravar(conexao, { versao: 1, sujeito: identidade.hash("operador:" + ator), tipo: "CONTAINMENT_CHANGED", severidade: "HIGH",
        instante: agora, ator, anterior: Boolean(linhas[0].contencao), ativo, resposta: "CONFIGURACAO_MANUAL" });
    });
  }
  async function limpar(agora) {
    // Lotes pequenos, comando explicito; nunca executado por requisicao.
    const [eventos] = await executar(pool, "DELETE FROM seguranca_eventos WHERE criado_em<DATE_SUB(CURRENT_TIMESTAMP,INTERVAL ? DAY) LIMIT 1000", [cfg.retencaoDias]);
    const [agregados] = await executar(pool, "DELETE FROM seguranca_agregados WHERE ultimo_ms<? AND bloquear_ate_ms<? AND limitar_ate_ms<? LIMIT 1000", [agora-cfg.retencaoDias*86400000, agora, agora]);
    const [alertas] = await executar(pool, "DELETE FROM seguranca_alerta_incidentes WHERE expira_ms<? LIMIT 1000", [agora]);
    return { eventos: eventos.affectedRows, agregados: agregados.affectedRows, alertas: alertas.affectedRows };
  }
  return { registrar, carregar, alterarContencao, limpar };
}
module.exports = criarDefesaRepository;
