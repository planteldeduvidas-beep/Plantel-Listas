const { obterConfiguracao } = require("../src/shared/config/ambiente");
const { criarPool } = require("../src/shared/database/conexao");
const criarAnalyticsRepository = require("../src/modules/analytics/analyticsRepository");
const criarAnalyticsService = require("../src/modules/analytics/analyticsService");

async function executar() {
  const configuracao = obterConfiguracao();
  const pool = criarPool(configuracao.banco);
  try {
    const service = criarAnalyticsService(criarAnalyticsRepository(pool));
    const resultado = await service.executarRetencao(configuracao.analytics);
    console.log("Retencao concluida: " + resultado.diasConsolidados + " dia(s), " + resultado.eventosRemovidos + " evento(s) bruto(s) removido(s) apos consolidacao.");
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  executar().catch(function tratarFalha(erro) {
    console.error("Falha na retencao de analytics: " + erro.message);
    process.exitCode = 1;
  });
}

module.exports = executar;
