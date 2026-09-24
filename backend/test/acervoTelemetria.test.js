const test = require("node:test");
const assert = require("node:assert/strict");
const criarAcervoService = require("../src/modules/materiais/acervoService");
const criarAnalyticsService = require("../src/modules/analytics/analyticsService");

test("falha de analytics nao bloqueia consulta nem abertura de material e e registrada", async function() {
  const avisos = [];
  const service = criarAcervoService({
    repository: {
      listarBreadcrumb: async function() { return []; },
      listarPastas: async function() { return []; },
      listarMateriais: async function() { return { itens: [], total: 0 }; },
      listarFiltros: async function() { return {}; },
      buscarMaterialDisponivel: async function() {
        return { id: 7, nome: "lista.pdf", mime_type: "application/pdf", drive_file_id: "arquivo-7", tamanho_bytes: 3 };
      }
    },
    provider: { obterConteudoArquivo: async function() { return new Response("PDF", { status: 200 }); } },
    integracaoService: { obterRefreshTokenParaUso: async function() { return "token-teste"; } },
    analyticsService: {
      registrarConsulta: async function() { throw Object.assign(new Error("dados privados"), { code: "ER_LOCK_WAIT_TIMEOUT" }); },
      registrarUso: async function() { throw Object.assign(new Error("dados privados"), { code: "ER_LOCK_WAIT_TIMEOUT" }); }
    },
    logger: { warn: function(dados, mensagem) { avisos.push({ dados: dados, mensagem: mensagem }); } }
  });
  const usuario = { id: 3, papel: "aluno" };
  const consulta = await service.consultar({}, usuario);
  assert.deepEqual(consulta.materiais, []);
  const arquivo = await service.obterArquivo("7", null, usuario, false);
  assert.equal(arquivo.resposta.status, 200);
  assert.equal(avisos.length, 2);
  assert.equal(JSON.stringify(avisos).includes("dados privados"), false);
});

test("403 de permissao do Drive nao invalida a credencial OAuth global", async function() {
  let invalidacoes = 0;
  const service = criarAcervoService({
    repository: { buscarMaterialDisponivel: async function() {
      return { id: 7, drive_file_id: "arquivo-7", tamanho_bytes: 3 };
    } },
    provider: { obterConteudoArquivo: async function() {
      throw Object.assign(new Error("acesso negado"), { codigo: "GOOGLE_PERMISSAO_NEGADA" });
    } },
    integracaoService: {
      obterRefreshTokenParaUso: async function() { return "token-teste"; },
      registrarFalhaDeAutorizacao: async function() { invalidacoes += 1; }
    }
  });
  await assert.rejects(service.obterArquivo("7", null, { id: 3 }, false), function(erro) {
    return erro.codigo === "GOOGLE_PERMISSAO_NEGADA";
  });
  assert.equal(invalidacoes, 0);
});

test("falha do evento preserva historico pessoal quando o banco ainda permite", async function() {
  let historico = null;
  const analytics = criarAnalyticsService({
    registrarUso: async function() { throw Object.assign(new Error("falha no evento"), { code: "ER_LOCK_WAIT_TIMEOUT" }); },
    registrarHistoricoAposFalha: async function(usuario, materialId, tipo) {
      historico = { usuarioId: usuario.id, materialId: materialId, tipo: tipo };
    }
  });
  await assert.rejects(analytics.registrarUso({ id: 9, papel: "aluno" }, 7, "visualizacao"));
  assert.deepEqual(historico, { usuarioId: 9, materialId: 7, tipo: "visualizacao" });
});
