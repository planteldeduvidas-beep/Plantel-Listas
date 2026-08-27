const test = require("node:test");
const assert = require("node:assert/strict");
const criarService = require("../src/modules/materiais/googleDriveChangesService");
const AppError = require("../src/shared/errors/AppError");

function criarCenario() {
  const estado = { page_token: "pagina-1", reconciliacao_necessaria: 0 };
  const chamadas = {
    aplicadas: null,
    erro: null,
    liberada: false,
    canalPreparado: null,
    canalAtivado: null,
    agendamentos: 0,
    tarefasAgendadas: 0,
    notificacao: null
  };
  const repository = {
    adquirirTrava: async function adquirirTrava() { return {}; },
    liberarTrava: async function liberarTrava() { chamadas.liberada = true; },
    buscarEstado: async function buscarEstado() { return estado; },
    salvarEstadoInicial: async function salvarEstadoInicial(token) { estado.page_token = token; },
    registrarErro: async function registrarErro(codigo) { chamadas.erro = codigo; },
    aplicarAlteracoes: async function aplicarAlteracoes(conexao, alteracoes, token) {
      chamadas.aplicadas = { alteracoes: alteracoes, token: token };
      return { atualizados: alteracoes.length, indisponiveis: 0, reconciliacaoNecessaria: alteracoes.some(function insegura(item) { return item.fallback; }) };
    },
    registrarVerificacao: async function registrarVerificacao() {},
    marcarNotificacoesProcessadas: async function marcarNotificacoesProcessadas() {},
    ehPastaConhecida: async function ehPastaConhecida() { return false; },
    marcarReconciliacaoNecessaria: async function marcarReconciliacaoNecessaria(codigo) { chamadas.erro = codigo; },
    buscarCanalAtivo: async function buscarCanalAtivo() { return null; },
    prepararCanal: async function prepararCanal(canal) { chamadas.canalPreparado = canal; },
    ativarCanal: async function ativarCanal(canal) { chamadas.canalAtivado = canal; },
    falharPreparacaoCanal: async function falharPreparacaoCanal() {},
    registrarNotificacao: async function registrarNotificacao(dados) {
      chamadas.notificacao = dados;
      return true;
    }
  };
  const provider = {
    pastaRaizId: "pasta-raiz-segura",
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
    listarSubarvore: async function listarSubarvore(token, pasta) {
      return { pastas: [Object.assign({}, pasta, { parentId: pasta.parents[0], nivel: 0 })], arquivos: [] };
    },
    observarAlteracoes: async function observarAlteracoes() { return { resourceId: "recurso_canal", expiration: String(Date.now() + 100000) }; },
    encerrarCanal: async function encerrarCanal() {}
  };
  const integracaoService = {
    obterRefreshTokenParaUso: async function obterRefreshTokenParaUso() { return "refresh-seguro"; },
    registrarFalhaDeAutorizacao: async function registrarFalhaDeAutorizacao() {},
    solicitarSincronizacaoAutomatica: async function solicitarSincronizacaoAutomatica() { chamadas.agendamentos += 1; }
  };
  const service = criarService({
    repository: repository,
    provider: provider,
    integracaoService: integracaoService,
    configuracao: { googleDrive: { webhookUrl: "https://acervo.example.com/api/integracoes/google-drive/webhook", intervaloChangesMs: 60000 } },
    agendarTarefa: function guardar() { chamadas.tarefasAgendadas += 1; }
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

test("mudanca fora da raiz fica indisponivel e pasta usa reconciliacao de subarvore", async function testarLimites() {
  const cenario = criarCenario();
  cenario.provider.verificarDescendenteDaRaiz = async function fora() { return false; };
  await cenario.service.processarAlteracoes();
  assert.equal(cenario.chamadas.aplicadas.alteracoes[0].disponivel, false);

  cenario.provider.verificarDescendenteDaRaiz = async function dentro() { return true; };
  cenario.provider.listarAlteracoes = async function pasta() {
    return { changes: [{ fileId: "pasta", file: { id: "pasta", name: "Pasta", mimeType: "application/vnd.google-apps.folder", parents: [cenario.provider.pastaRaizId] } }], newStartPageToken: "pagina-3" };
  };
  const resumo = await cenario.service.processarAlteracoes();
  assert.equal(Boolean(cenario.chamadas.aplicadas.alteracoes[0].subarvore), true);
  assert.equal(resumo.reconciliacaoNecessaria, false);
  assert.equal(cenario.chamadas.agendamentos, 0);
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

test("mudanca da propria raiz usa full sync somente como fallback seguro", async function testarFallbackEstrutural() {
  const cenario = criarCenario();
  cenario.provider.listarAlteracoes = async function alterarRaiz() {
    return {
      changes: [{
        fileId: cenario.provider.pastaRaizId,
        file: {
          id: cenario.provider.pastaRaizId,
          name: "Raiz renomeada",
          mimeType: "application/vnd.google-apps.folder",
          parents: []
        }
      }],
      newStartPageToken: "pagina-fallback"
    };
  };
  const resumo = await cenario.service.processarAlteracoes();
  assert.equal(resumo.reconciliacaoNecessaria, true);
  assert.equal(cenario.chamadas.agendamentos, 1);
});

test("renovacao cria canal com URL exata e persiste somente hash fora do service", async function testarRenovacao() {
  const cenario = criarCenario();
  const resultado = await cenario.service.renovarCanal();
  assert.equal(resultado.configurado, true);
  assert.match(cenario.chamadas.canalPreparado.id, /^[0-9a-f-]{36}$/);
  assert.equal(cenario.chamadas.canalAtivado.resourceId, "recurso_canal");
});

test("notificacao sync e aceita sem agendar alteracao de material", async function testarSync() {
  const cenario = criarCenario();
  const resultado = await cenario.service.receberNotificacao({
    "x-goog-channel-id": "123e4567-e89b-12d3-a456-426614174000",
    "x-goog-resource-id": "recurso_sync_123",
    "x-goog-message-number": "1",
    "x-goog-resource-state": "sync",
    "x-goog-channel-token": "token-sync-com-mais-de-trinta-e-dois-caracteres"
  });
  assert.equal(resultado.aceita, true);
  assert.equal(cenario.chamadas.notificacao.resourceState, "sync");
  assert.equal(cenario.chamadas.aplicadas, null);
  assert.equal(cenario.chamadas.tarefasAgendadas, 0);
});
