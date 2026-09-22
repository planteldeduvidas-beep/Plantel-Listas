const test = require("node:test");
const assert = require("node:assert/strict");
const AppError = require("../src/shared/errors/AppError");
const criarIntegracaoGoogleDriveService = require(
  "../src/modules/materiais/integracaoGoogleDriveService"
);

function criarCenario(opcoes) {
  const estado = {
    manutencoes: 0,
    concluida: false,
    liberada: false,
    falhaSemTrava: null,
    tarefa: null
  };
  const conexao = {};
  const repository = {
    buscarCredencial: async function buscarCredencial() { return null; },
    criarSincronizacaoAguardando: async function criar() { return 1; },
    adquirirTravaDeSincronizacao: async function adquirir() { return conexao; },
    marcarSincronizando: async function marcar() { return true; },
    manterTravaDeSincronizacao: async function manter() {
      estado.manutencoes += 1;
      if (opcoes.falhaManutencao) {
        throw opcoes.falhaManutencao;
      }
      return true;
    },
    aplicarSincronizacao: async function aplicar() {
      return {
        pastasEncontradas: 1,
        arquivosEncontrados: 2,
        materiaisCriados: 2,
        materiaisAtualizados: 0,
        itensIndisponiveis: 0
      };
    },
    concluirSincronizacao: async function concluir() { estado.concluida = true; },
    falharSincronizacao: async function falhar() {
      if (opcoes.falhaAoRegistrar) {
        throw opcoes.falhaAoRegistrar;
      }
    },
    falharSincronizacaoSemTrava: async function falharSemTrava(id, codigo) {
      estado.falhaSemTrava = codigo;
    },
    liberarTravaDeSincronizacao: async function liberar() {
      estado.liberada = true;
      if (opcoes.falhaAoLiberar) {
        throw opcoes.falhaAoLiberar;
      }
    }
  };
  const provider = {
    escopo: "https://www.googleapis.com/auth/drive",
    pastaRaizId: "pasta-raiz",
    listarArvore: async function listar() {
      await new Promise(function aguardar(resolve) { setTimeout(resolve, 30); });
      return { raiz: {}, pastas: [{}], arquivos: [{}, {}] };
    }
  };
  const service = criarIntegracaoGoogleDriveService({
    repository: repository,
    provider: provider,
    configuracao: {
      googleDrive: {
        refreshToken: "refresh-token-de-teste",
        encryptionKey: "chave-de-teste"
      },
      seguranca: { csrfSecret: "csrf-de-teste" }
    },
    intervaloManutencaoTravaMs: 5,
    agendarTarefa: function agendar(tarefa) { estado.tarefa = tarefa; }
  });
  return { estado: estado, service: service };
}

test("mantem a conexao da trava ativa durante listagem longa", async function testarManutencao() {
  const cenario = criarCenario({});
  await cenario.service.solicitarSincronizacao(1, {});
  await cenario.estado.tarefa();

  assert.ok(cenario.estado.manutencoes >= 2);
  assert.equal(cenario.estado.concluida, true);
  assert.equal(cenario.estado.liberada, true);
  assert.equal(cenario.estado.falhaSemTrava, null);
});

test("preserva codigo da falha se a conexao da trava cair", async function testarQueda() {
  const cenario = criarCenario({
    falhaManutencao: new AppError(
      "Conexao da trava perdida",
      503,
      "TRAVA_SINCRONIZACAO_PERDIDA"
    ),
    falhaAoRegistrar: new Error("Conexao encerrada"),
    falhaAoLiberar: new Error("Conexao encerrada")
  });
  await cenario.service.solicitarSincronizacao(1, {});
  await cenario.estado.tarefa();

  assert.equal(cenario.estado.concluida, false);
  assert.equal(cenario.estado.liberada, true);
  assert.equal(
    cenario.estado.falhaSemTrava,
    "TRAVA_SINCRONIZACAO_PERDIDA"
  );
});
