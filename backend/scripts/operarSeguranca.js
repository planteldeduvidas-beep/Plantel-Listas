const { obterConfiguracao } = require("../src/shared/config/ambiente");
const { criarPool } = require("../src/shared/database/conexao");
const criarRepository = require("../src/modules/seguranca/defesaRepository");
const { criarIdentidade } = require("../src/modules/seguranca/politicaDefesa");

async function executar(args = process.argv.slice(2)) {
  const [comando, valor, ator] = args;
  if (!["status", "conter", "limpar", "verificar"].includes(comando)
      || (comando === "conter" && (!["on", "off"].includes(valor) || !/^[A-Za-z0-9_.@-]{3,80}$/.test(ator || "")))) {
    throw new Error("Use: status | conter on/off identificador-operador | limpar | verificar");
  }
  const cfg = obterConfiguracao();
  const pool = criarPool(cfg.banco);
  const identidade = criarIdentidade(cfg.defesa.chaveEvidencia);
  const repo = criarRepository(pool, cfg.defesa, identidade);
  try {
    if (comando === "conter") {
      await repo.alterarContencao(valor === "on", ator, Date.now());
      console.log("Contencao manual " + (valor === "on" ? "ativada" : "desativada") + "; alteracao auditada.");
    } else if (comando === "limpar") {
      console.log(JSON.stringify(await repo.limpar(Date.now())));
    } else if (comando === "verificar") {
      let ultimo = 0, total = 0, invalidos = 0;
      // Snapshot superior fixo; paginado sem imprimir evidencia ou origem pessoal.
      const [max] = await pool.execute("SELECT COALESCE(MAX(id),0) AS maximo FROM seguranca_eventos");
      const teto = Number(max[0].maximo);
      while (ultimo < teto) {
        const [linhas] = await pool.execute("SELECT id,evidencia,assinatura FROM seguranca_eventos WHERE id>? AND id<=? ORDER BY id LIMIT 500", [ultimo,teto]);
        if (!linhas.length) break;
        for (const linha of linhas) { total++; if (!identidade.verificar(linha.evidencia, linha.assinatura)) invalidos++; ultimo = Number(linha.id); }
      }
      console.log(JSON.stringify({ verificados: total, assinaturasInvalidas: invalidos }));
      if (invalidos) process.exitCode = 1;
    } else {
      const atual = await repo.carregar(Date.now());
      console.log(JSON.stringify({ contencao: atual.contencao, restricoesAtivas: atual.estados.length }));
    }
  } finally { await pool.end(); }
}
if (require.main === module) executar().catch(() => {
  console.error("Operacao de seguranca nao concluida; confira argumentos, SECURITY_EVIDENCE_KEY e migrations 018/019. Nenhum detalhe sensivel sera exibido.");
  process.exitCode = 1;
});
module.exports = executar;
