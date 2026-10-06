const test = require("node:test");
const assert = require("node:assert/strict");
const AppError = require("../src/shared/errors/AppError");
const criarIntegracaoGoogleDriveService = require(
  "../src/modules/materiais/integracaoGoogleDriveService"
);

function criarCenario(opcoes) {
  const estado = {
    aquisicoes: 0,
    concluida: false,
    liberada: false,
    falhaSemTrava: null,
    tarefa: null,
    aplicacoes: 0
  };
  const conexao = {};
  const repository = {
    buscarCredencial: async function buscarCredencial() {
      return opcoes.credencialAlterada && estado.aquisicoes >= 2
        ? { refresh_token_criptografado: "outra-autorizacao" } : null;
    },
    criarSincronizacaoAguardando: async function criar() { return 1; },
    adquirirTravaDeSincronizacao: async function adquirir() {
      estado.aquisicoes += 1;
      if (opcoes.travaOcupada && opcoes.travaOcupada(estado.aquisicoes)) return null;
      return conexao;
    },
    marcarEsperaPorTrava: async function (_id, aguardando) { estado.aguardandoTrava = aguardando; },
    marcarSincronizando: async function marcar() { return true; },
    obterInicioDaListagem: async function obterInicio() { return "2026-09-30 10:00:00.000000"; },
    aplicarSincronizacao: async function aplicar(_conexao, _id, _arvore, _raiz, inicioDaListagem) {
      assert.equal(inicioDaListagem, "2026-09-30 10:00:00.000000");
      estado.aplicacoes += 1;
      if (opcoes.falhaAplicacao) throw opcoes.falhaAplicacao;
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
    logger: opcoes.logger,
    configuracao: {
      googleDrive: {
        refreshToken: "refresh-token-de-teste",
        encryptionKey: "chave-de-teste"
      },
      seguranca: { csrfSecret: "csrf-de-teste" }
    },
    intervaloManutencaoTravaMs: 5,
    aguardarTrava: async function () {},
    agendarTarefa: function agendar(tarefa) { estado.tarefa = tarefa; }
  });
  return { estado: estado, service: service };
}

test("libera a trava durante a listagem e a readquire antes de gravar", async function testarTravaDaListagem() {
  const cenario = criarCenario({});
  await cenario.service.solicitarSincronizacao(1, {});
  await cenario.estado.tarefa();

  assert.equal(cenario.estado.aquisicoes, 2);
  assert.equal(cenario.estado.concluida, true);
  assert.equal(cenario.estado.liberada, true);
  assert.equal(cenario.estado.falhaSemTrava, null);
});

test("aguarda disputa antes da gravacao e aplica uma unica vez", async function () {
  const cenario = criarCenario({ travaOcupada: function (n) { return n === 2 || n === 3; } });
  await cenario.service.solicitarSincronizacao(1, {});
  await cenario.estado.tarefa();
  assert.equal(cenario.estado.aquisicoes, 4);
  assert.equal(cenario.estado.aplicacoes, 1);
  assert.equal(cenario.estado.concluida, true);
  assert.equal(cenario.estado.aguardandoTrava, false);
});

test("encerra espera limitada sem aplicar arvore quando trava permanece ocupada", async function () {
  const cenario = criarCenario({ travaOcupada: function (n) { return n >= 2; } });
  await cenario.service.solicitarSincronizacao(1, {});
  await cenario.estado.tarefa();
  assert.equal(cenario.estado.aplicacoes, 0);
  assert.equal(cenario.estado.concluida, false);
  assert.equal(cenario.estado.falhaSemTrava, "SINCRONIZACAO_CONCORRENTE");
  assert.equal(cenario.estado.aquisicoes, 33);
});

test("aguarda trava inicial sem perder a solicitacao", async function () {
  const cenario = criarCenario({ travaOcupada: function (n) { return n === 1; } });
  await cenario.service.solicitarSincronizacao(1, {});
  await cenario.estado.tarefa();
  assert.equal(cenario.estado.concluida, true);
  assert.equal(cenario.estado.aplicacoes, 1);
});

test("nao aplica varredura da credencial antiga depois de nova autorizacao", async function() {
  const cenario = criarCenario({ credencialAlterada: true });
  await cenario.service.solicitarSincronizacao(1, {});
  await cenario.estado.tarefa();
  assert.equal(cenario.estado.aplicacoes, 0);
  assert.equal(cenario.estado.concluida, false);
});

test("preserva erro SQL original quando registrar falha tambem falha", async function () {
  const cenario = criarCenario({
    falhaAplicacao: Object.assign(new Error("SQL invalido"), { code: "ER_PARSE_ERROR" }),
    falhaAoRegistrar: Object.assign(new Error("Conexao perdida"), { codigo: "BANCO_INDISPONIVEL" })
  });
  await cenario.service.solicitarSincronizacao(1, {});
  await cenario.estado.tarefa();
  assert.equal(cenario.estado.falhaSemTrava, "ER_PARSE_ERROR");
  assert.equal(cenario.estado.concluida, false);
});

test("rollback com falha nao substitui erro da importacao", async function () {
  const criarRepository = require("../src/modules/materiais/integracaoGoogleDriveRepository");
  const original = Object.assign(new Error("SQL invalido"), { code: "ER_PARSE_ERROR" });
  let rollbackExecutado = false;
  const conexao = {
    beginTransaction: async function () {},
    execute: async function () { throw original; },
    rollback: async function () {
      rollbackExecutado = true;
      throw new Error("Conexao perdida");
    }
  };
  await assert.rejects(
    criarRepository({}).aplicarSincronizacao(conexao, 1, { pastas: [], arquivos: [] }, "raiz", "2026-09-30 10:00:00.000000"),
    function (erro) { return erro === original; }
  );
  assert.equal(rollbackExecutado, true);
});

test("diagnostico registra etapa e local sem mensagem sensivel", async function () {
  const mensagens = [];
  const falha = new TypeError("segredo-na-mensagem");
  falha.stack = "TypeError: segredo-na-mensagem\n    at executar (/app/repository.js:12:3)";
  const cenario = criarCenario({
    falhaAplicacao: falha,
    logger: {
      error: function (_dados, mensagem) { mensagens.push(mensagem); },
      warn: function () {}
    }
  });
  await cenario.service.solicitarSincronizacao(1, {});
  await cenario.estado.tarefa();
  assert.match(mensagens[0], /etapa=gravar_banco/);
  assert.match(mensagens[0], /tipo=TypeError/);
  assert.match(mensagens[0], /repository.js:12:3/);
  assert.equal(mensagens.join("").includes("segredo-na-mensagem"), false);
});

test("registra a falha da listagem depois de readquirir a trava", async function testarFalhaDaListagem() {
  const cenario = criarCenario({
    falhaAplicacao: new AppError("Falha de gravacao", 503, "BANCO_INDISPONIVEL")
  });
  await cenario.service.solicitarSincronizacao(1, {});
  await cenario.estado.tarefa();

  assert.equal(cenario.estado.concluida, false);
  assert.equal(cenario.estado.aquisicoes, 2);
  assert.equal(cenario.estado.liberada, true);
});
