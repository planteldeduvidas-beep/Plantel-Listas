const test = require("node:test");
const assert = require("node:assert/strict");
const criarAnalyticsService = require("../src/modules/analytics/analyticsService");

test("painel separa navegacoes, interacoes e totais mensais sem somar pessoas por dia", async () => {
  const repository = {
    resumo: async () => ({ materiais: { total: 2, pdfs: 1, videos: 1 }, usuarios: { total: 3, alunos: 2, professores: 0, administradores: 1, ativos: 3 } }),
    porDisciplina: async () => [], porConcurso: async () => [],
    cobertura: async () => ({ resumos: [], eventosSemPapel: 0 }),
    evolucao: async () => [
      { dia: "2026-08-31", acessos: 3, visualizacoes: 1, downloads: 0, alunos_ativos: 2 },
      { dia: "2026-09-01", acessos: 2, visualizacoes: 1, downloads: 1, alunos_ativos: 1 }
    ],
    maisUsados: async () => [], recentes: async () => [], atividade: async () => [],
    buscas: async () => [{ termo: "matematica", quantidade: 2 }], pastasMaisAcessadas: async () => [],
    engajamento: async () => ({ alunos_com_navegacao: 2, alunos_com_material: 1, alunos_que_navegaram_e_interagiram: 1, buscas: 2 })
  };
  const painel = await criarAnalyticsService(repository).obterPainel({ periodo: 90 });
  assert.deepEqual(painel.evolucaoMensal.map(({ mes, acessos }) => [mes, acessos]), [["2026-08", 3], ["2026-09", 2]]);
  assert.equal(painel.engajamento.alunosComNavegacao, 2);
  assert.equal(painel.engajamento.taxaDeInteracao, 50);
  assert.equal(painel.termosMaisPesquisados[0].termo, "matematica");
});
