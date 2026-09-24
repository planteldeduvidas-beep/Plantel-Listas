const test = require("node:test");
const assert = require("node:assert/strict");
const pino = require("pino");
const request = require("supertest");
const criarAplicacao = require("../src/app");
const { obterConfiguracao } = require("../src/shared/config/ambiente");
const { criarPool } = require("../src/shared/database/conexao");
const { criarEmailProviderFake } = require("../src/shared/providers/emailProvider");
const { criarHashDaSenha } = require("../src/modules/autenticacao/senha");
const { ESCOPO_LEITURA, ESCOPO_GESTAO } = require("../src/shared/providers/googleDriveProvider");
const AppError = require("../src/shared/errors/AppError");
const criarChangesRepository = require("../src/modules/materiais/googleDriveChangesRepository");
const criarChangesService = require("../src/modules/materiais/googleDriveChangesService");

const configuracaoBase = obterConfiguracao();
const nomeBancoTeste = process.env.DB_TEST_NAME || configuracaoBase.banco.nome + "_test";
const configuracaoTeste = Object.assign({}, configuracaoBase, {
  ambiente: "test",
  nivelDeLog: "silent",
  banco: Object.assign({}, configuracaoBase.banco, { nome: nomeBancoTeste }),
  seguranca: Object.assign({}, configuracaoBase.seguranca, {
    limiteAutenticacao: 1000,
    limiteRecuperacao: 1000
  }),
  googleDrive: {
    clientId: "cliente-integracao.apps.googleusercontent.com",
    clientSecret: "segredo-integracao",
    pastaRaizId: "pastaRaizIntegracao12345",
    redirectUri: "http://localhost:3000/api/integracoes/google-drive/oauth/callback",
    refreshToken: "refresh-token-configurado-no-backend",
    escopo: ESCOPO_GESTAO
  }
});
const pool = criarPool(configuracaoTeste.banco);
const logger = pino({ level: "silent" });
const senhaPadrao = "Senha-forte-fase-4";
let usuarios;
let arvoreAtual;
let esperaDaListagem;
let avisarInicioDaListagem;
let erroDaListagem;
let tarefasAgendadas = [];
let refreshTokenOAuthAtual;

const providerFake = {
  escopo: ESCOPO_GESTAO,
  pastaRaizId: configuracaoTeste.googleDrive.pastaRaizId,
  gerarUrlAutorizacao: function gerarUrlAutorizacao(estado) {
    return "https://accounts.google.test/authorize?scope="
      + encodeURIComponent(ESCOPO_GESTAO) + "&state=" + encodeURIComponent(estado);
  },
  trocarCodigoPorRefreshToken: async function trocarCodigoPorRefreshToken() {
    return refreshTokenOAuthAtual;
  },
  listarArvore: async function listarArvore() {
    if (avisarInicioDaListagem) {
      avisarInicioDaListagem();
      avisarInicioDaListagem = null;
    }
    if (esperaDaListagem) {
      await esperaDaListagem;
    }
    if (erroDaListagem) {
      throw erroDaListagem;
    }
    return JSON.parse(JSON.stringify(arvoreAtual));
  }
};

const aplicacao = criarAplicacao(configuracaoTeste, logger, {
  pool: pool,
  emailProvider: criarEmailProviderFake(),
  googleDriveProvider: providerFake,
  agendarTarefaGoogleDrive: function guardarTarefa(tarefa) {
    tarefasAgendadas.push(tarefa);
  }
});

function criarArvoreInicial() {
  return {
    raiz: { id: providerFake.pastaRaizId, nome: "Acervo" },
    pastas: [
      {
        id: "drivePastaListas12345",
        name: "LISTAS",
        mimeType: "application/vnd.google-apps.folder",
        parentId: providerFake.pastaRaizId,
        nivel: 0
      },
      {
        id: "drivePastaMatematica12345",
        name: "MATEMATICA",
        mimeType: "application/vnd.google-apps.folder",
        parentId: "drivePastaListas12345",
        nivel: 1
      }
    ],
    arquivos: [
      {
        id: "driveArquivoPdf12345",
        name: "lista-01.pdf",
        mimeType: "application/pdf",
        size: "1024",
        md5Checksum: "abc123",
        createdTime: "2026-01-01T10:00:00.000Z",
        modifiedTime: "2026-01-02T10:00:00.000Z",
        parentId: "drivePastaMatematica12345"
      },
      {
        id: "driveArquivoVideo12345",
        name: "aula-01.mp4",
        mimeType: "video/mp4",
        size: "2048",
        parentId: "drivePastaListas12345"
      },
      {
        id: "driveArquivoOutro12345",
        name: "observacoes.txt",
        mimeType: "text/plain",
        size: "32",
        parentId: providerFake.pastaRaizId
      }
    ]
  };
}

async function limparCategorias() {
  let removidas = 1;
  while (removidas > 0) {
    const [resultado] = await pool.execute(
      "DELETE categoria FROM categorias categoria "
      + "LEFT JOIN categorias filha ON filha.categoria_pai_id = categoria.id "
      + "WHERE filha.id IS NULL"
    );
    removidas = resultado.affectedRows;
  }
}

async function limparBanco() {
  await pool.execute("DELETE FROM notificacoes_google_drive");
  await pool.execute("DELETE FROM canais_google_drive");
  await pool.execute("DELETE FROM estado_changes_google_drive");
  await pool.execute("DELETE FROM permissoes_professor_categoria");
  await pool.execute("DELETE FROM materiais");
  await limparCategorias();
  await pool.execute("DELETE FROM disciplinas");
  await pool.execute("DELETE FROM concursos");
  await pool.execute("DELETE FROM credenciais_google_drive");
  await pool.execute("DELETE FROM estados_oauth_google_drive");
  await pool.execute("DELETE FROM sincronizacoes_google_drive");
  await pool.execute("DELETE FROM recuperacoes_senha");
  await pool.execute("DELETE FROM sessoes");
  await pool.execute("DELETE FROM usuarios");
}

async function criarUsuario(email, papel) {
  const senhaHash = await criarHashDaSenha(senhaPadrao);
  const [resultado] = await pool.execute(
    "INSERT INTO usuarios (email, senha_hash, papel) VALUES (?, ?, ?)",
    [email, senhaHash, papel]
  );
  return { id: Number(resultado.insertId), email: email, papel: papel };
}

async function prepararUsuarios() {
  usuarios = {
    admin: await criarUsuario("admin-fase4@example.com", "admin"),
    professor: await criarUsuario("professor-fase4@example.com", "professor"),
    aluno: await criarUsuario("aluno-fase4@example.com", "aluno")
  };
}

async function obterCsrf(agente) {
  const resposta = await agente.get("/api/autenticacao/csrf");
  assert.equal(resposta.status, 200);
  return resposta.body.csrfToken;
}

async function autenticar(chave) {
  const usuario = usuarios[chave];
  const agente = request.agent(aplicacao);
  const csrf = await obterCsrf(agente);
  const resposta = await agente.post("/api/autenticacao/login")
    .set("X-CSRF-Token", csrf)
    .send({ email: usuario.email, senha: senhaPadrao });
  assert.equal(resposta.status, 200);
  return { agente: agente, csrf: csrf, usuario: usuario };
}

async function executarProximaTarefa() {
  const tarefa = tarefasAgendadas.shift();
  assert.equal(typeof tarefa, "function");
  await tarefa();
}

test.beforeEach(async function prepararTeste() {
  await limparBanco();
  await prepararUsuarios();
  arvoreAtual = criarArvoreInicial();
  esperaDaListagem = null;
  avisarInicioDaListagem = null;
  erroDaListagem = null;
  tarefasAgendadas = [];
  refreshTokenOAuthAtual = "refresh-token-retornado-pelo-google-fake";
});

test.after(async function encerrarTeste() {
  await limparBanco();
  await pool.end();
});

test("migration cria estrutura segura para OAuth, sincronizacoes e materiais", async function testarMigration() {
  const tabelasEsperadas = [
    "credenciais_google_drive",
    "estados_oauth_google_drive",
    "materiais",
    "sincronizacoes_google_drive"
  ];
  const [tabelas] = await pool.execute(
    "SELECT TABLE_NAME, ENGINE, TABLE_COLLATION FROM information_schema.TABLES "
    + "WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (?, ?, ?, ?) ORDER BY TABLE_NAME",
    [nomeBancoTeste].concat(tabelasEsperadas)
  );
  assert.equal(tabelas.length, 4);
  tabelas.forEach(function validarTabela(tabela) {
    assert.equal(tabela.ENGINE, "InnoDB");
    assert.equal(tabela.TABLE_COLLATION, "utf8mb4_unicode_ci");
  });

  const [indices] = await pool.execute(
    "SELECT INDEX_NAME FROM information_schema.STATISTICS "
    + "WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'materiais' AND NON_UNIQUE = 0",
    [nomeBancoTeste]
  );
  assert.equal(indices.some(function encontrar(indice) {
    return indice.INDEX_NAME === "uq_materiais_drive_file_id";
  }), true);

  const [colunas] = await pool.execute(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS "
    + "WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'categorias' AND COLUMN_NAME = 'drive_pasta_id'",
    [nomeBancoTeste]
  );
  assert.equal(colunas.length, 1);

  const [colunasSincronizacao] = await pool.execute(
    "SELECT COLUMN_NAME, COLUMN_TYPE FROM information_schema.COLUMNS "
    + "WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'sincronizacoes_google_drive' "
    + "AND COLUMN_NAME IN ('status', 'solicitada_em') ORDER BY COLUMN_NAME",
    [nomeBancoTeste]
  );
  assert.equal(colunasSincronizacao.length, 2);
  const status = colunasSincronizacao.find(function encontrar(coluna) {
    return coluna.COLUMN_NAME === "status";
  });
  assert.equal(status.COLUMN_TYPE.includes("'aguardando'"), true);
  assert.equal(status.COLUMN_TYPE.includes("'sincronizando'"), true);
});

test("rotas Google Drive sao exclusivas de admin e mutacoes exigem CSRF", async function testarAutorizacao() {
  const admin = await autenticar("admin");
  const professor = await autenticar("professor");
  const aluno = await autenticar("aluno");

  assert.equal((await request(aplicacao).get("/api/integracoes/google-drive/status")).status, 401);
  assert.equal((await professor.agente.get("/api/integracoes/google-drive/status")).status, 403);
  assert.equal((await aluno.agente.get("/api/integracoes/google-drive/status")).status, 403);
  assert.equal((await admin.agente.get("/api/integracoes/google-drive/status")).status, 200);

  const semCsrf = await admin.agente.post("/api/integracoes/google-drive/sincronizar").send({});
  assert.equal(semCsrf.status, 403);
  assert.equal(semCsrf.body.erro.codigo, "CSRF_INVALIDO");

  const manipulacao = await admin.agente.post("/api/integracoes/google-drive/sincronizar")
    .set("X-CSRF-Token", admin.csrf)
    .send({ driveFileId: "arquivo-fora-da-raiz" });
  assert.equal(manipulacao.status, 400);
  assert.equal(manipulacao.body.erro.codigo, "CAMPO_NAO_PERMITIDO");
});

test("OAuth usa estado com hash, guarda token criptografado e bloqueia replay", async function testarOAuth() {
  const admin = await autenticar("admin");
  const inicio = await admin.agente.post("/api/integracoes/google-drive/oauth/iniciar")
    .set("X-CSRF-Token", admin.csrf)
    .send({});
  assert.equal(inicio.status, 200);
  const url = new URL(inicio.body.urlAutorizacao);
  const estado = url.searchParams.get("state");
  assert.equal(Boolean(estado), true);
  assert.equal(JSON.stringify(inicio.body).includes("refresh-token"), false);

  const [estados] = await pool.execute(
    "SELECT estado_hash FROM estados_oauth_google_drive WHERE usuario_id = ?",
    [admin.usuario.id]
  );
  assert.equal(estados.length, 1);
  assert.notEqual(estados[0].estado_hash, estado);
  assert.equal(estados[0].estado_hash.length, 64);

  await pool.execute(
    "INSERT INTO estado_changes_google_drive (id,page_token,atualizado_em) VALUES (1,'cursor-antigo',NOW(3))"
  );
  await pool.execute(
    "INSERT INTO canais_google_drive (channel_id,resource_id,token_hash,expira_em,status,criado_em) "
    + "VALUES ('123e4567-e89b-12d3-a456-426614174001','recurso-antigo',?,DATE_ADD(NOW(3),INTERVAL 1 DAY),'ativo',NOW(3))",
    ["a".repeat(64)]
  );

  const callback = await admin.agente.get(
    "/api/integracoes/google-drive/oauth/callback?code=codigo-google-teste&state="
    + encodeURIComponent(estado)
  );
  assert.equal(callback.status, 303, JSON.stringify(callback.body));
  assert.equal(callback.headers.location, configuracaoTeste.frontendUrl + "/?googleDrive=conectado&area=drive&oauthPopup=1");
  assert.equal(JSON.stringify(callback.body).includes("refresh-token"), false);

  const [credenciais] = await pool.execute(
    "SELECT refresh_token_criptografado, escopo FROM credenciais_google_drive WHERE id = 1"
  );
  assert.equal(credenciais.length, 1);
  assert.equal(
    credenciais[0].refresh_token_criptografado.includes("refresh-token-retornado"),
    false
  );
  assert.equal(credenciais[0].escopo, ESCOPO_GESTAO);
  const [cursorAntigo] = await pool.execute("SELECT id FROM estado_changes_google_drive WHERE id=1");
  const [canalAntigo] = await pool.execute("SELECT status FROM canais_google_drive WHERE channel_id='123e4567-e89b-12d3-a456-426614174001'");
  assert.equal(cursorAntigo.length, 0);
  assert.equal(canalAntigo[0].status, "expirado");

  const replay = await admin.agente.get(
    "/api/integracoes/google-drive/oauth/callback?code=outro-codigo-teste&state="
    + encodeURIComponent(estado)
  );
  assert.equal(replay.status, 400);
  assert.equal(replay.body.erro.codigo, "GOOGLE_ESTADO_INVALIDO");
});

test("credencial do scope antigo exige reconexao antes de qualquer uso", async function testarScopeAntigo() {
  const admin = await autenticar("admin");
  const inicio = await admin.agente.post("/api/integracoes/google-drive/oauth/iniciar")
    .set("X-CSRF-Token", admin.csrf)
    .send({});
  const estado = new URL(inicio.body.urlAutorizacao).searchParams.get("state");
  await admin.agente.get(
    "/api/integracoes/google-drive/oauth/callback?code=codigo-google-teste&state="
    + encodeURIComponent(estado)
  );
  await pool.execute(
    "UPDATE credenciais_google_drive SET escopo=?,renovacao_necessaria=0 WHERE id=1",
    [ESCOPO_LEITURA]
  );

  const status = await admin.agente.get("/api/integracoes/google-drive/status");
  assert.equal(status.status, 200);
  assert.equal(status.body.googleDrive.conectado, false);
  assert.equal(status.body.googleDrive.renovacaoNecessaria, true);
  assert.equal(status.body.googleDrive.escopo, ESCOPO_GESTAO);

  const sincronizacao = await admin.agente.post("/api/integracoes/google-drive/sincronizar")
    .set("X-CSRF-Token", admin.csrf)
    .send({});
  assert.equal(sincronizacao.status, 409);
  assert.equal(sincronizacao.body.erro.codigo, "GOOGLE_RECONEXAO_NECESSARIA");
});

test("sincronizacao importa por Drive ID e permanece idempotente", async function testarSincronizacao() {
  const admin = await autenticar("admin");
  await pool.execute("INSERT INTO categorias (nome, ordem) VALUES ('LISTAS', 9)");

  const primeira = await admin.agente.post("/api/integracoes/google-drive/sincronizar")
    .set("X-CSRF-Token", admin.csrf)
    .send({});
  assert.equal(primeira.status, 202);
  assert.equal(primeira.body.sincronizacao.status, "aguardando");
  assert.equal(tarefasAgendadas.length, 1);
  await executarProximaTarefa();

  const statusPrimeira = await admin.agente.get("/api/integracoes/google-drive/status");
  assert.equal(statusPrimeira.body.googleDrive.ultimaSincronizacao.status, "concluida");
  assert.equal(statusPrimeira.body.googleDrive.ultimaSincronizacao.pastasEncontradas, 2);
  assert.equal(statusPrimeira.body.googleDrive.ultimaSincronizacao.arquivosEncontrados, 3);
  assert.equal(statusPrimeira.body.googleDrive.ultimaSincronizacao.materiaisCriados, 3);

  const [categorias] = await pool.execute(
    "SELECT id, nome, drive_pasta_id, categoria_pai_id FROM categorias ORDER BY id"
  );
  assert.equal(categorias.length, 2);
  assert.equal(categorias[0].drive_pasta_id, "drivePastaListas12345");
  assert.equal(Number(categorias[1].categoria_pai_id), Number(categorias[0].id));

  const [materiais] = await pool.execute(
    "SELECT drive_file_id, tipo, disponivel FROM materiais ORDER BY drive_file_id"
  );
  assert.equal(materiais.length, 3);
  assert.deepEqual(materiais.map(function obterTipo(item) { return item.tipo; }).sort(), ["outro", "pdf", "video"]);
  assert.equal(materiais.every(function disponivel(item) { return item.disponivel === 1; }), true);

  const segunda = await admin.agente.post("/api/integracoes/google-drive/sincronizar")
    .set("X-CSRF-Token", admin.csrf)
    .send({});
  assert.equal(segunda.status, 202);
  await executarProximaTarefa();
  const statusSegunda = await admin.agente.get("/api/integracoes/google-drive/status");
  assert.equal(statusSegunda.body.googleDrive.ultimaSincronizacao.materiaisCriados, 0);
  assert.equal(statusSegunda.body.googleDrive.ultimaSincronizacao.materiaisAtualizados, 3);

  const [quantidades] = await pool.execute(
    "SELECT (SELECT COUNT(*) FROM categorias) AS categorias, "
    + "(SELECT COUNT(*) FROM materiais) AS materiais"
  );
  assert.equal(Number(quantidades[0].categorias), 2);
  assert.equal(Number(quantidades[0].materiais), 3);
});

test("bootstrap importa arquivos existentes antes de usar o cursor e recupera falha", async function() {
  const repository = criarChangesRepository(pool);
  let consultasIncrementais = 0;
  const providerChanges = Object.assign({}, providerFake, {
    obterInicioDasAlteracoes: async function() { return "cursor-antes-da-varredura"; },
    listarAlteracoes: async function(token, cursor) {
      consultasIncrementais += 1;
      assert.equal(cursor, "cursor-antes-da-varredura");
      return { changes: [], newStartPageToken: "cursor-apos-varredura" };
    }
  });
  const service = criarChangesService({
    repository: repository,
    provider: providerChanges,
    integracaoService: aplicacao.locals.integracaoGoogleDriveService,
    configuracao: configuracaoTeste,
    agendarTarefa: function() {}
  });
  const nomeOriginal = arvoreAtual.pastas[1].name;
  arvoreAtual.pastas[1].name = "X".repeat(121); // falha SQL depois da primeira pasta
  await service.processarAlteracoes();
  assert.equal(consultasIncrementais, 0);
  assert.equal(tarefasAgendadas.length, 1);
  await executarProximaTarefa();
  const pendente = await repository.buscarEstado();
  assert.equal(Number(pendente.reconciliacao_necessaria), 1);
  assert.equal(pendente.page_token, "cursor-antes-da-varredura");
  const [parcial] = await pool.execute("SELECT COUNT(*) AS total FROM categorias");
  assert.equal(Number(parcial[0].total), 0);
  await service.processarAlteracoes();
  assert.equal(consultasIncrementais, 0);
  arvoreAtual.pastas[1].name = nomeOriginal;
  await executarProximaTarefa();
  const concluido = await repository.buscarEstado();
  assert.equal(Number(concluido.reconciliacao_necessaria), 0);
  assert.equal(concluido.page_token, "cursor-antes-da-varredura");
  const [materiais] = await pool.execute("SELECT COUNT(*) AS total FROM materiais");
  assert.equal(Number(materiais[0].total), 3);
  await service.processarAlteracoes();
  assert.equal(consultasIncrementais, 1);
  const final = await repository.buscarEstado();
  assert.equal(final.page_token, "cursor-apos-varredura");
  const [semDuplicacao] = await pool.execute("SELECT COUNT(*) AS total,COUNT(DISTINCT drive_file_id) AS unicos FROM materiais");
  assert.equal(Number(semDuplicacao[0].total), Number(semDuplicacao[0].unicos));
});

test("nova sincronizacao atualiza nomes e marca arquivos ausentes sem apagar registros", async function testarReindexacao() {
  const admin = await autenticar("admin");
  await admin.agente.post("/api/integracoes/google-drive/sincronizar")
    .set("X-CSRF-Token", admin.csrf).send({});
  await executarProximaTarefa();

  arvoreAtual.pastas[0].name = "LISTAS ATUALIZADAS";
  arvoreAtual.arquivos = arvoreAtual.arquivos.filter(function removerPdf(item) {
    return item.id !== "driveArquivoPdf12345";
  });
  arvoreAtual.arquivos.push({
    id: "driveArquivoNovo12345",
    name: "lista-02.pdf",
    mimeType: "application/pdf",
    size: "4096",
    parentId: "drivePastaMatematica12345"
  });

  const resposta = await admin.agente.post("/api/integracoes/google-drive/sincronizar")
    .set("X-CSRF-Token", admin.csrf).send({});
  assert.equal(resposta.status, 202);
  await executarProximaTarefa();
  const status = await admin.agente.get("/api/integracoes/google-drive/status");
  assert.equal(status.body.googleDrive.ultimaSincronizacao.materiaisCriados, 1);
  assert.equal(status.body.googleDrive.ultimaSincronizacao.itensIndisponiveis, 1);

  const [pasta] = await pool.execute(
    "SELECT nome FROM categorias WHERE drive_pasta_id = 'drivePastaListas12345'"
  );
  assert.equal(pasta[0].nome, "LISTAS ATUALIZADAS");
  const [arquivoAntigo] = await pool.execute(
    "SELECT disponivel FROM materiais WHERE drive_file_id = 'driveArquivoPdf12345'"
  );
  assert.equal(arquivoAntigo[0].disponivel, 0);
});

test("POST desacopla a sincronizacao, expoe status e impede concorrencia", async function testarConcorrencia() {
  const admin = await autenticar("admin");
  let liberarListagem;
  let avisarListagem;
  esperaDaListagem = new Promise(function aguardar(resolve) {
    liberarListagem = resolve;
  });
  const listagemIniciada = new Promise(function aguardarInicio(resolve) {
    avisarListagem = resolve;
  });
  avisarInicioDaListagem = avisarListagem;

  const primeira = await admin.agente.post("/api/integracoes/google-drive/sincronizar")
    .set("X-CSRF-Token", admin.csrf).send({});
  assert.equal(primeira.status, 202);
  assert.equal(primeira.body.sincronizacao.status, "aguardando");

  const segunda = await admin.agente.post("/api/integracoes/google-drive/sincronizar")
    .set("X-CSRF-Token", admin.csrf).send({});
  assert.equal(segunda.status, 409);
  assert.equal(segunda.body.erro.codigo, "SINCRONIZACAO_EM_ANDAMENTO");

  const tarefa = tarefasAgendadas.shift();
  const execucao = tarefa();
  await listagemIniciada;
  const durante = await admin.agente.get("/api/integracoes/google-drive/status");
  assert.equal(durante.body.googleDrive.ultimaSincronizacao.status, "sincronizando");

  liberarListagem();
  await execucao;
  const concluida = await admin.agente.get("/api/integracoes/google-drive/status");
  assert.equal(concluida.body.googleDrive.ultimaSincronizacao.status, "concluida");
});

test("worker persiste falha sem manter a requisicao HTTP aberta", async function testarFalha() {
  const admin = await autenticar("admin");
  erroDaListagem = new AppError(
    "Drive indisponivel no teste",
    503,
    "GOOGLE_DRIVE_INDISPONIVEL"
  );

  const resposta = await admin.agente.post("/api/integracoes/google-drive/sincronizar")
    .set("X-CSRF-Token", admin.csrf).send({});
  assert.equal(resposta.status, 202);
  assert.equal(resposta.body.sincronizacao.status, "aguardando");

  await executarProximaTarefa();
  const status = await admin.agente.get("/api/integracoes/google-drive/status");
  assert.equal(status.body.googleDrive.ultimaSincronizacao.status, "falhou");
  assert.equal(
    status.body.googleDrive.ultimaSincronizacao.erroCodigo,
    "GOOGLE_DRIVE_INDISPONIVEL"
  );
});

test("reinicio encerra execucao interrompida e permite nova solicitacao", async function testarInterrupcao() {
  const admin = await autenticar("admin");
  const resposta = await admin.agente.post("/api/integracoes/google-drive/sincronizar")
    .set("X-CSRF-Token", admin.csrf).send({});
  assert.equal(resposta.status, 202);
  await pool.execute(
    "UPDATE sincronizacoes_google_drive SET status = 'sincronizando', "
    + "iniciada_em = CURRENT_TIMESTAMP(3) WHERE id = ?",
    [resposta.body.sincronizacao.id]
  );

  const encerradas = await aplicacao.locals.integracaoGoogleDriveService
    .recuperarSincronizacoesInterrompidas();
  assert.equal(encerradas, 1);
  tarefasAgendadas = [];

  const status = await admin.agente.get("/api/integracoes/google-drive/status");
  assert.equal(status.body.googleDrive.ultimaSincronizacao.status, "falhou");
  assert.equal(
    status.body.googleDrive.ultimaSincronizacao.erroCodigo,
    "SINCRONIZACAO_INTERROMPIDA"
  );

  const nova = await admin.agente.post("/api/integracoes/google-drive/sincronizar")
    .set("X-CSRF-Token", admin.csrf).send({});
  assert.equal(nova.status, 202);
});

test("token Google invalido exige renovacao e OAuth substitui a credencial", async function testarRenovacao() {
  const admin = await autenticar("admin");
  erroDaListagem = new AppError(
    "Token revogado no teste",
    503,
    "GOOGLE_AUTORIZACAO_INVALIDA"
  );

  const resposta = await admin.agente.post("/api/integracoes/google-drive/sincronizar")
    .set("X-CSRF-Token", admin.csrf).send({});
  assert.equal(resposta.status, 202);
  await executarProximaTarefa();

  const invalido = await admin.agente.get("/api/integracoes/google-drive/status");
  assert.equal(invalido.body.googleDrive.conectado, false);
  assert.equal(invalido.body.googleDrive.renovacaoNecessaria, true);
  assert.equal(JSON.stringify(invalido.body).includes("refresh-token"), false);

  const [credencialAnterior] = await pool.execute(
    "SELECT refresh_token_criptografado FROM credenciais_google_drive WHERE id = 1"
  );
  refreshTokenOAuthAtual = "refresh-token-renovado-pelo-google-fake";
  const inicio = await admin.agente.post("/api/integracoes/google-drive/oauth/iniciar")
    .set("X-CSRF-Token", admin.csrf).send({});
  const estado = new URL(inicio.body.urlAutorizacao).searchParams.get("state");
  const callback = await admin.agente.get(
    "/api/integracoes/google-drive/oauth/callback?code=codigo-renovacao-teste&state="
    + encodeURIComponent(estado)
  );
  assert.equal(callback.status, 303);
  assert.equal(JSON.stringify(callback.body).includes("refresh-token"), false);

  const [credencialNova] = await pool.execute(
    "SELECT refresh_token_criptografado, renovacao_necessaria, erro_codigo "
    + "FROM credenciais_google_drive WHERE id = 1"
  );
  assert.notEqual(
    credencialNova[0].refresh_token_criptografado,
    credencialAnterior[0].refresh_token_criptografado
  );
  assert.equal(credencialNova[0].renovacao_necessaria, 0);
  assert.equal(credencialNova[0].erro_codigo, null);

  const renovado = await admin.agente.get("/api/integracoes/google-drive/status");
  assert.equal(renovado.body.googleDrive.conectado, true);
  assert.equal(renovado.body.googleDrive.renovacaoNecessaria, false);
});
