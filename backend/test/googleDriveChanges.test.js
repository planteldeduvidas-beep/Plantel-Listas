const test = require("node:test");
const assert = require("node:assert/strict");
const criarService = require("../src/modules/materiais/googleDriveChangesService");
const AppError = require("../src/shared/errors/AppError");

function criarCenario() {
  const estado = { page_token: "pagina-1", reconciliacao_necessaria: 0 };
  const chamadas = { aplicadas: null, erro: null, liberada: false, canal: null };
  const repository = {
    adquirirTrava: async function adquirirTrava() { return {}; },
    liberarTrava: async function liberarTrava() { chamadas.liberada = true; },
    buscarEstado: async function buscarEstado() { return estado; },
    salvarEstadoInicial: async function salvarEstadoInicial(token) { estado.page_token = token; },
    registrarErro: async function registrarErro(codigo) { chamadas.erro = codigo; },
    aplicarAlteracoes: async function aplicarAlteracoes(conexao, alteracoes, token) {
      chamadas.aplicadas = { alteracoes: alteracoes, token: token };
      return { atualizados: alteracoes.length, indisponiveis: 0, reconciliacaoNecessaria: alteracoes.some(function estrutural(item) { return item.estrutural; }) };
    },
    registrarVerificacao: async function registrarVerificacao() {},
    marcarNotificacoesProcessadas: async function marcarNotificacoesProcessadas() {},
    ehPastaConhecida: async function ehPastaConhecida() { return false; },
    marcarReconciliacaoNecessaria: async function marcarReconciliacaoNecessaria(codigo) { chamadas.erro = codigo; },
    buscarCanalAtivo: async function buscarCanalAtivo() { return null; },
    salvarCanal: async function salvarCanal(canal) { chamadas.canal = canal; },
    registrarNotificacao: async function registrarNotificacao() { return true; }
  };
  const provider = {
    obterInicioDasAlteracoes: async function obterInicioDasAlteracoes() { return "inicio"; },
    listarAlteracoes: async function listarAlteracoes() {
      return {
        changes: [{
          fileId: "arquivo-novo",
          removed: false,
          file: { id: "arquivo-novo", name: "novo.pdf", mimeType: "application/pdf", parents: ["pasta-interna"] }
        }],
        newStartPageToken: "pagina-2"
      };
    },
    verificarDescendenteDaRaiz: async function verificarDescendenteDaRaiz() { return true; },
    observarAlteracoes: async function observarAlteracoes() { return { resourceId: "recurso_canal", expiration: String(Date.now() + 100000) }; },
    encerrarCanal: async function encerrarCanal() {}
  };
  const integracaoService = {
    obterRefreshTokenParaUso: async function obterRefreshTokenParaUso() { return "refresh-seguro"; },
    registrarFalhaDeAutorizacao: async function registrarFalhaDeAutorizacao() {},
    solicitarSincronizacaoAutomatica: async function solicitarSincronizacaoAutomatica() {}
  };
  const service = criarService({
    repository: repository,
    provider: provider,
    integracaoService: integracaoService,
    configuracao: { googleDrive: { webhookUrl: "https://acervo.example.com/api/integracoes/google-drive/webhook", intervaloChangesMs: 60000 } },
    agendarTarefa: function ignorar() {}
  });
  return { service: service, provider: provider, repository: repository, chamadas: chamadas };
}

test("Changes API aplica criacao dentro da raiz e avanca token de forma idempotente", async function testarCriacao() {
  const cenario = criarCenario();
  const resumo = await cenario.service.processarAlteracoes();
  assert.equal(resumo.atualizados, 1);
  assert.equal(cenario.chamadas.aplicadas.token, "pagina-2");
  assert.equal(cenario.chamadas.aplicadas.alteracoes[0].item.parentId, "pasta-interna");
  assert.equal(cenario.chamadas.liberada, true);
});

test("mudanca fora da raiz fica indisponivel e pasta estrutural pede reconciliacao", async function testarLimites() {
  const cenario = criarCenario();
  cenario.provider.verificarDescendenteDaRaiz = async function fora() { return false; };
  await cenario.service.processarAlteracoes();
  assert.equal(cenario.chamadas.aplicadas.alteracoes[0].disponivel, false);

  cenario.provider.listarAlteracoes = async function pasta() {
    return { changes: [{ fileId: "pasta", file: { id: "pasta", mimeType: "application/vnd.google-apps.folder", parents: ["raiz"] } }], newStartPageToken: "pagina-3" };
  };
  const resumo = await cenario.service.processarAlteracoes();
  assert.equal(resumo.reconciliacaoNecessaria, true);
});

test("page token perdido prepara full sync de fallback e falha Google e controlada", async function testarTokenPerdido() {
  const cenario = criarCenario();
  cenario.provider.listarAlteracoes = async function expirado() {
    throw new AppError("expirou", 503, "GOOGLE_PAGE_TOKEN_EXPIRADO");
  };
  await assert.rejects(cenario.service.processarAlteracoes(), function validar(erro) {
    return erro.codigo === "GOOGLE_PAGE_TOKEN_EXPIRADO";
  });
  assert.equal(cenario.chamadas.erro, "GOOGLE_PAGE_TOKEN_EXPIRADO");
});

test("renovacao cria canal com URL exata e persiste somente hash fora do service", async function testarRenovacao() {
  const cenario = criarCenario();
  const resultado = await cenario.service.renovarCanal();
  assert.equal(resultado.configurado, true);
  assert.equal(cenario.chamadas.canal.resourceId, "recurso_canal");
  assert.match(cenario.chamadas.canal.id, /^[0-9a-f-]{36}$/);
});
