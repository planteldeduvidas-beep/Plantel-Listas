const test = require("node:test");
const assert = require("node:assert/strict");
const pino = require("pino");
const request = require("supertest");
const criarAplicacao = require("../src/app");
const { obterConfiguracao } = require("../src/shared/config/ambiente");
const { criarPool } = require("../src/shared/database/conexao");
const { criarEmailProviderFake } = require("../src/shared/providers/emailProvider");
const { criarHashDaSenha } = require("../src/modules/autenticacao/senha");
const { ESCOPO_LEITURA } = require("../src/shared/providers/googleDriveProvider");
const { gerarHashDoToken } = require("../src/shared/utils/tokens");
const criarChangesRepository = require("../src/modules/materiais/googleDriveChangesRepository");
const criarAcervoRepository = require("../src/modules/materiais/acervoRepository");
const { recomendacaoDaCategoria } = require("../src/modules/materiais/classificacaoAutomatica");

const base = obterConfiguracao();
const nomeBanco = process.env.DB_TEST_NAME || base.banco.nome + "_test";
const configuracao = Object.assign({}, base, {
  ambiente: "test",
  nivelDeLog: "silent",
  banco: Object.assign({}, base.banco, { nome: nomeBanco }),
  googleDrive: {
    clientId: "cliente-fase5.apps.googleusercontent.com",
    clientSecret: "segredo-fase5",
    pastaRaizId: "pastaRaizFaseCinco12345",
    redirectUri: "http://localhost:3000/api/integracoes/google-drive/oauth/callback",
    refreshToken: "refresh-token-fase-cinco",
    webhookUrl: "",
    intervaloChangesMs: 60000,
    escopo: ESCOPO_LEITURA
  }
});
const pool = criarPool(configuracao.banco);
const logger = pino({ level: "silent" });
let ultimoDriveId;

const provider = {
  escopo: ESCOPO_LEITURA,
  pastaRaizId: configuracao.googleDrive.pastaRaizId,
  obterConteudoArquivo: async function obterConteudoArquivo(token, driveId, range) {
    ultimoDriveId = driveId;
    const conteudo = Buffer.from("0123456789", "utf8");
    if (range) {
      const partes = /^bytes=(\d+)-(\d*)$/.exec(range);
      const inicio = Number(partes[1]);
      const fim = partes[2] ? Number(partes[2]) : conteudo.length - 1;
      const trecho = conteudo.subarray(inicio, fim + 1);
      return new Response(trecho, {
        status: 206,
        headers: {
          "content-range": "bytes " + inicio + "-" + fim + "/" + conteudo.length,
          "content-length": String(trecho.length)
        }
      });
    }
    return new Response(conteudo, { status: 200, headers: { "content-length": "10" } });
  },
  gerarUrlAutorizacao: function gerarUrlAutorizacao() { return "https://google.test"; },
  trocarCodigoPorRefreshToken: async function trocarCodigoPorRefreshToken() { return "refresh-token-fase-cinco"; },
  listarArvore: async function listarArvore() { return { raiz: {}, pastas: [], arquivos: [] }; }
};

const aplicacao = criarAplicacao(configuracao, logger, {
  pool: pool,
  emailProvider: criarEmailProviderFake(),
  googleDriveProvider: provider,
  agendarTarefaGoogleDrive: function ignorar() {},
  agendarTarefaGoogleDriveChanges: function ignorar() {}
});
let usuarios;
let materialId;
let categoriaId;
let disciplinaId;

async function limparCategorias() {
  let removidas = 1;
  while (removidas > 0) {
    const [resultado] = await pool.execute(
      "DELETE c FROM categorias c LEFT JOIN categorias f ON f.categoria_pai_id=c.id WHERE f.id IS NULL"
    );
    removidas = resultado.affectedRows;
  }
}

async function limpar() {
  await pool.execute("DELETE FROM notificacoes_google_drive");
  await pool.execute("DELETE FROM canais_google_drive");
  await pool.execute("DELETE FROM estado_changes_google_drive");
  await pool.execute("DELETE FROM materiais");
  await pool.execute("DELETE FROM auditoria_classificacao_categorias");
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
  const [resultado] = await pool.execute(
    "INSERT INTO usuarios (email,senha_hash,papel) VALUES (?,?,?)",
    [email, await criarHashDaSenha("Senha-forte-fase-5"), papel]
  );
  return { id: Number(resultado.insertId), email: email, papel: papel };
}

async function autenticar(papel) {
  const agente = request.agent(aplicacao);
  const csrf = (await agente.get("/api/autenticacao/csrf")).body.csrfToken;
  const resposta = await agente.post("/api/autenticacao/login")
    .set("X-CSRF-Token", csrf)
    .send({ email: usuarios[papel].email, senha: "Senha-forte-fase-5" });
  assert.equal(resposta.status, 200);
  return { agente: agente, csrf: csrf };
}

test.beforeEach(async function preparar() {
  await limpar();
  usuarios = {
    admin: await criarUsuario("admin-fase5@example.com", "admin"),
    professor: await criarUsuario("professor-fase5@example.com", "professor"),
    aluno: await criarUsuario("aluno-fase5@example.com", "aluno")
  };
  const [disciplina] = await pool.execute("INSERT INTO disciplinas (nome) VALUES ('Matemática')");
  disciplinaId = Number(disciplina.insertId);
  const [categoria] = await pool.execute(
    "INSERT INTO categorias (nome,drive_pasta_id,disciplina_id,disciplina_estado,disciplina_origem,classificacao_origem) "
    + "VALUES ('Listas','drivePastaFase5',?,'definida','manual','manual')",
    [disciplinaId]
  );
  categoriaId = Number(categoria.insertId);
  const [sync] = await pool.execute(
    "INSERT INTO sincronizacoes_google_drive (iniciado_por_usuario_id,status,solicitada_em,iniciada_em,concluida_em) "
    + "VALUES (?,'concluida',NOW(3),NOW(3),NOW(3))",
    [usuarios.admin.id]
  );
  const [material] = await pool.execute(
    "INSERT INTO materiais (drive_file_id,categoria_id,nome,mime_type,tipo,extensao,tamanho_bytes,ultima_sincronizacao_drive_id) "
    + "VALUES ('drivePdfInternoFase5',?,'Prova segura \"2026\".pdf','application/pdf','pdf','pdf',10,?)",
    [categoriaId, Number(sync.insertId)]
  );
  materialId = Number(material.insertId);
  ultimoDriveId = null;
});

test.after(async function encerrar() {
  await limpar();
  await pool.end();
});

test("navega com breadcrumb, busca parametrizada, filtros e paginacao", async function testarConsulta() {
  const autenticado = await autenticar("aluno");
  const raiz = await autenticado.agente.get("/api/acervo?pagina=1&limite=1");
  assert.equal(raiz.status, 200);
  assert.equal(raiz.body.pastas[0].nome, "Listas");
  assert.equal(raiz.body.paginacao.limite, 1);

  const pasta = await autenticado.agente.get("/api/acervo?categoriaId=" + categoriaId + "&tipo=pdf&disciplinaId=" + disciplinaId);
  assert.equal(pasta.status, 200);
  assert.deepEqual(pasta.body.breadcrumb, [{ id: categoriaId, nome: "Listas" }]);
  assert.equal(pasta.body.materiais[0].id, materialId);
  assert.equal(Object.prototype.hasOwnProperty.call(pasta.body.materiais[0], "driveFileId"), false);

  const injecao = await autenticado.agente.get("/api/acervo?busca=" + encodeURIComponent("%' OR 1=1 --"));
  assert.equal(injecao.status, 200);
  assert.equal(injecao.body.paginacao.totalItens, 0);
});

test("conta materiais funcionais disponiveis em toda a subarvore das pastas", async function testarContagemRecursiva() {
  const [filha] = await pool.execute(
    "INSERT INTO categorias (nome,categoria_pai_id,drive_pasta_id) VALUES ('Prof. Germano',?,'drivePastaFilhaContagem')",
    [categoriaId]
  );
  const filhaId = Number(filha.insertId);
  const [neta] = await pool.execute(
    "INSERT INTO categorias (nome,categoria_pai_id,drive_pasta_id) VALUES ('Fisica',?,'drivePastaNetaContagem')",
    [filhaId]
  );
  const netaId = Number(neta.insertId);
  const [vazia] = await pool.execute(
    "INSERT INTO categorias (nome,categoria_pai_id,drive_pasta_id) VALUES ('Pasta vazia',?,'drivePastaVaziaContagem')",
    [categoriaId]
  );
  const vaziaId = Number(vazia.insertId);
  const [oculta] = await pool.execute(
    "INSERT INTO categorias (nome,categoria_pai_id,drive_pasta_id,ativo) VALUES ('Pasta oculta',?,'drivePastaOcultaContagem',0)",
    [filhaId]
  );
  const ocultaId = Number(oculta.insertId);

  await pool.execute(
    "INSERT INTO materiais (drive_file_id,categoria_id,nome,mime_type,tipo,extensao,disponivel,estado_gestao,ultima_sincronizacao_drive_id) VALUES "
      + "('drivePdfFilhaContagem',?,'Material direto.pdf','application/pdf','pdf','pdf',1,'disponivel',NULL),"
      + "('driveVideoNetoContagem',?,'Material profundo.mp4','video/mp4','video','mp4',1,'disponivel',NULL),"
      + "('drivePdfLixeiraContagem',?,'Material na lixeira.pdf','application/pdf','pdf','pdf',0,'lixeira',NULL),"
      + "('driveOutroContagem',?,'Documento fora da V1.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','outro','docx',1,'disponivel',NULL),"
      + "('drivePdfIndisponivelContagem',?,'Material indisponivel.pdf','application/pdf','pdf','pdf',0,'disponivel',NULL),"
      + "('drivePdfOcultoContagem',?,'Material oculto.pdf','application/pdf','pdf','pdf',1,'disponivel',NULL)",
    [filhaId, netaId, netaId, netaId, netaId, ocultaId]
  );

  const autenticado = await autenticar("aluno");
  const raiz = await autenticado.agente.get("/api/acervo");
  const listas = raiz.body.pastas.find(function encontrar(item) { return item.id === categoriaId; });
  assert.equal(listas.quantidadePastas, 2);
  assert.equal(listas.quantidadeMateriais, 3);

  const primeiroNivel = await autenticado.agente.get("/api/acervo?categoriaId=" + categoriaId);
  const professora = primeiroNivel.body.pastas.find(function encontrar(item) { return item.id === filhaId; });
  const pastaVazia = primeiroNivel.body.pastas.find(function encontrar(item) { return item.id === vaziaId; });
  assert.equal(professora.quantidadePastas, 1);
  assert.equal(professora.quantidadeMateriais, 2);
  assert.equal(pastaVazia.quantidadePastas, 0);
  assert.equal(pastaVazia.quantidadeMateriais, 0);

  const segundoNivel = await autenticado.agente.get("/api/acervo?categoriaId=" + filhaId);
  const fisica = segundoNivel.body.pastas.find(function encontrar(item) { return item.id === netaId; });
  assert.equal(fisica.quantidadePastas, 0);
  assert.equal(fisica.quantidadeMateriais, 1);
});

test("regras automaticas usam nomes e contextos inequivocos sem classificar pasta ambigua", function testarRegrasAutomaticas() {
  const raiz = { id: 1, nome: "LISTAS", categoria_pai_id: null };
  const mapas = new Map([[1, raiz]]);
  const composta = recomendacaoDaCategoria({ id: 2, nome: "Física IME", categoria_pai_id: 1 }, mapas);
  assert.equal(composta.disciplina.nome, "Física");
  assert.equal(composta.concurso.nome, "IME");
  const multidisciplinar = recomendacaoDaCategoria({ id: 3, nome: "Física e Matemática", categoria_pai_id: 1 }, mapas);
  assert.equal(multidisciplinar.disciplina.estado, "nao_se_aplica");
  const ambigua = recomendacaoDaCategoria({ id: 4, nome: "Materiais novos", categoria_pai_id: 1 }, mapas);
  assert.equal(ambigua.disciplina, undefined);
});

test("entrega PDF e Range por materialId sem aceitar driveFileId do cliente", async function testarArquivo() {
  const autenticado = await autenticar("aluno");
  const pdf = await autenticado.agente.get("/api/acervo/materiais/" + materialId + "/conteudo");
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers["content-type"], "application/pdf");
  assert.match(pdf.headers["content-disposition"], /^inline;/);
  assert.equal(ultimoDriveId, "drivePdfInternoFase5");

  const range = await autenticado.agente.get("/api/acervo/materiais/" + materialId + "/conteudo").set("Range", "bytes=2-5");
  assert.equal(range.status, 206);
  assert.equal(range.headers["content-range"], "bytes 2-5/10");
  assert.equal(range.body.toString("utf8"), "2345");

  const invalido = await autenticado.agente.get("/api/acervo/materiais/" + materialId + "/conteudo").set("Range", "bytes=50-60");
  assert.equal(invalido.status, 416);
  assert.equal(invalido.headers["content-range"], "bytes */10");
  const arbitrario = await autenticado.agente.get("/api/acervo/materiais/drivePdfInternoFase5/conteudo");
  assert.equal(arbitrario.status, 400);
});

test("download usa anexo e nome seguro e material indisponivel nao e entregue", async function testarDownload() {
  const autenticado = await autenticar("professor");
  const download = await autenticado.agente.get("/api/acervo/materiais/" + materialId + "/download");
  assert.equal(download.status, 200);
  assert.match(download.headers["content-disposition"], /^attachment;/);
  assert.equal(download.headers["content-disposition"].includes("\r"), false);
  await pool.execute("UPDATE materiais SET disponivel=0 WHERE id=?", [materialId]);
  const ausente = await autenticado.agente.get("/api/acervo/materiais/" + materialId + "/conteudo");
  assert.equal(ausente.status, 404);
});

test("classificacao e exclusiva de admin, exige CSRF e bloqueia mass assignment", async function testarClassificacao() {
  const aluno = await autenticar("aluno");
  const proibido = await aluno.agente.patch("/api/acervo/pastas/" + categoriaId + "/classificacao")
    .set("X-CSRF-Token", aluno.csrf).send({ disciplina: { estado: "herdar", id: null } });
  assert.equal(proibido.status, 403);
  assert.equal((await aluno.agente.get("/api/acervo/organizacao")).status, 403);

  const admin = await autenticar("admin");
  const semCsrf = await admin.agente.patch("/api/acervo/pastas/" + categoriaId + "/classificacao")
    .send({ disciplina: { estado: "herdar", id: null } });
  assert.equal(semCsrf.status, 403);
  const loteSemCsrf = await admin.agente.patch("/api/acervo/organizacao")
    .send({ categoriaIds: [categoriaId], concurso: { estado: "nao_se_aplica", id: null } });
  assert.equal(loteSemCsrf.status, 403);
  const excesso = await admin.agente.patch("/api/acervo/pastas/" + categoriaId + "/classificacao")
    .set("X-CSRF-Token", admin.csrf).send({ disciplina: { estado: "herdar", id: null }, driveFileId: "nao" });
  assert.equal(excesso.status, 400);
});

test("acervo exige sessao e rejeita parametros fora da allowlist", async function testarProtecoes() {
  assert.equal((await request(aplicacao).get("/api/acervo")).status, 401);
  const autenticado = await autenticar("aluno");
  assert.equal((await autenticado.agente.get("/api/acervo?ordenar=DROP_TABLE")).status, 400);
  assert.equal((await autenticado.agente.get("/api/acervo?driveFileId=qualquer")).status, 400);
});

test("arquivos fora dos tipos aprovados nao aparecem nem sao entregues", async function testarTiposNaoAprovados() {
  const [sincronizacoes] = await pool.execute(
    "SELECT id FROM sincronizacoes_google_drive ORDER BY id DESC LIMIT 1"
  );
  const [outro] = await pool.execute(
    "INSERT INTO materiais (drive_file_id,categoria_id,nome,mime_type,tipo,extensao,tamanho_bytes,"
    + "ultima_sincronizacao_drive_id) VALUES ('driveDocxNaoAprovado',?,'material.docx',"
    + "'application/vnd.openxmlformats-officedocument.wordprocessingml.document','outro','docx',100,?)",
    [categoriaId, Number(sincronizacoes[0].id)]
  );
  const autenticado = await autenticar("aluno");
  const consulta = await autenticado.agente.get("/api/acervo?categoriaId=" + categoriaId);
  assert.equal(consulta.status, 200);
  assert.equal(consulta.body.materiais.some(function localizar(item) {
    return item.id === Number(outro.insertId);
  }), false);
  assert.equal((await autenticado.agente.get(
    "/api/acervo/materiais/" + Number(outro.insertId) + "/download"
  )).status, 404);
  assert.equal((await autenticado.agente.get("/api/acervo?tipo=outro")).status, 400);
});

test("classifica subarvores em lote com heranca, override, nao se aplica e filtros imediatos", async function testarOrganizacaoEmEscala() {
  const [fisica] = await pool.execute("INSERT INTO disciplinas (nome) VALUES ('Física')");
  const [efomm] = await pool.execute("INSERT INTO concursos (nome) VALUES ('EFOMM')");
  const [provas] = await pool.execute(
    "INSERT INTO categorias (nome,categoria_pai_id,drive_pasta_id,concurso_id,concurso_estado,concurso_origem) "
    + "VALUES ('EFOMM',?,'driveEfommOrganizacao',?,'definida','manual')",
    [categoriaId, Number(efomm.insertId)]
  );
  const [fisicaPasta] = await pool.execute(
    "INSERT INTO categorias (nome,categoria_pai_id,drive_pasta_id,disciplina_id,disciplina_estado,disciplina_origem) "
    + "VALUES ('Física',?,'driveFisicaOrganizacao',?,'definida','manual')",
    [Number(provas.insertId), Number(fisica.insertId)]
  );
  const [novaPasta] = await pool.execute(
    "INSERT INTO categorias (nome,categoria_pai_id,drive_pasta_id) VALUES ('2026',?,'driveNovaOrganizacao')",
    [Number(fisicaPasta.insertId)]
  );
  const [sync] = await pool.execute("SELECT id FROM sincronizacoes_google_drive ORDER BY id DESC LIMIT 1");
  await pool.execute(
    "INSERT INTO materiais (drive_file_id,categoria_id,nome,mime_type,tipo,extensao,ultima_sincronizacao_drive_id) "
    + "VALUES ('driveHerdadoOrganizacao',?,'fisica-efomm.pdf','application/pdf','pdf','pdf',?)",
    [Number(novaPasta.insertId), Number(sync[0].id)]
  );
  const repository = criarAcervoRepository(pool);
  const combinados = await repository.listarMateriais({
    categoriaId: null, pagina: 1, limite: 20, busca: "fisica-efomm.pdf", tipo: null,
    disciplinaId: Number(fisica.insertId), concursoId: Number(efomm.insertId), ordenar: "nome_asc"
  });
  assert.equal(combinados.total, 1);
  assert.equal(combinados.itens[0].disciplina.id, Number(fisica.insertId));
  assert.equal(combinados.itens[0].concurso.id, Number(efomm.insertId));

  const admin = await autenticar("admin");
  const lote = await admin.agente.patch("/api/acervo/organizacao")
    .set("X-CSRF-Token", admin.csrf)
    .send({ categoriaIds: [categoriaId], concurso: { estado: "nao_se_aplica", id: null } });
  assert.equal(lote.status, 200);
  assert.equal(lote.body.atualizadas, 1);
  const organizacao = await admin.agente.get("/api/acervo/organizacao");
  assert.equal(organizacao.status, 200);
  assert.equal(organizacao.body.pastasPendentes.length, 0);

  const [destino] = await pool.execute(
    "INSERT INTO categorias (nome,drive_pasta_id,concurso_estado,concurso_origem) "
    + "VALUES ('Sem concurso','driveDestinoSemConcurso','nao_se_aplica','manual')"
  );
  await pool.execute("UPDATE categorias SET categoria_pai_id=? WHERE id=?", [Number(destino.insertId), Number(fisicaPasta.insertId)]);
  const movido = await repository.listarMateriais({
    categoriaId: Number(destino.insertId), pagina: 1, limite: 20, busca: "fisica-efomm.pdf", tipo: null,
    disciplinaId: Number(fisica.insertId), concursoId: null, ordenar: "nome_asc"
  });
  assert.equal(movido.total, 1);
  assert.equal(movido.itens[0].disciplina.id, Number(fisica.insertId));
  assert.equal(movido.itens[0].concurso, null);
});

test("webhook valida canal e token, aceita chamada publica e ignora duplicata", async function testarWebhook() {
  const channelId = "123e4567-e89b-12d3-a456-426614174000";
  const resourceId = "resource_fase5_123";
  const token = "token-webhook-fase-cinco-com-mais-de-trinta-e-dois-caracteres";
  await pool.execute(
    "INSERT INTO canais_google_drive (channel_id,resource_id,token_hash,expira_em,status,criado_em) "
    + "VALUES (?,?,?,DATE_ADD(NOW(3),INTERVAL 1 DAY),'ativo',NOW(3))",
    [channelId, resourceId, gerarHashDoToken(token)]
  );
  const cabecalhos = {
    "X-Goog-Channel-ID": channelId,
    "X-Goog-Resource-ID": resourceId,
    "X-Goog-Message-Number": "10",
    "X-Goog-Resource-State": "change",
    "X-Goog-Channel-Token": token
  };
  const primeira = await request(aplicacao).post("/api/integracoes/google-drive/webhook").set(cabecalhos);
  const duplicada = await request(aplicacao).post("/api/integracoes/google-drive/webhook").set(cabecalhos);
  assert.equal(primeira.status, 202);
  assert.equal(duplicada.status, 202);
  const invalida = await request(aplicacao).post("/api/integracoes/google-drive/webhook")
    .set(Object.assign({}, cabecalhos, { "X-Goog-Channel-Token": token + "-errado" }));
  assert.equal(invalida.status, 403);
  const [notificacoes] = await pool.execute("SELECT COUNT(*) AS total FROM notificacoes_google_drive");
  assert.equal(Number(notificacoes[0].total), 1);
});

test("sync inicial pode chegar com canal ainda em preparacao e nao processa materiais", async function testarSyncAntecipado() {
  const channelId = "223e4567-e89b-12d3-a456-426614174000";
  const token = "token-sync-antecipado-com-mais-de-trinta-e-dois-caracteres";
  await pool.execute(
    "INSERT INTO canais_google_drive (channel_id,resource_id,token_hash,expira_em,status,criado_em) "
    + "VALUES (?,NULL,?,DATE_ADD(NOW(3),INTERVAL 1 DAY),'preparando',NOW(3))",
    [channelId, gerarHashDoToken(token)]
  );
  const cabecalhos = {
    "X-Goog-Channel-ID": channelId,
    "X-Goog-Resource-ID": "resource_sync_antecipado",
    "X-Goog-Message-Number": "1",
    "X-Goog-Resource-State": "sync",
    "X-Goog-Channel-Token": token
  };
  assert.equal((await request(aplicacao).post("/api/integracoes/google-drive/webhook").set(cabecalhos)).status, 202);
  assert.equal((await request(aplicacao).post("/api/integracoes/google-drive/webhook").set(cabecalhos)).status, 202);
  const [notificacoes] = await pool.execute(
    "SELECT resource_state,COUNT(*) AS total FROM notificacoes_google_drive "
    + "WHERE channel_id=? GROUP BY resource_state",
    [channelId]
  );
  assert.equal(notificacoes[0].resource_state, "sync");
  assert.equal(Number(notificacoes[0].total), 1);
});

test("reconcilia renomeacao, movimentacao e remocao de subarvore sem full sync", async function testarSubarvore() {
  const [destino] = await pool.execute(
    "INSERT INTO categorias (nome,drive_pasta_id,disciplina_id,disciplina_estado,disciplina_origem,classificacao_origem) "
    + "VALUES ('Destino','driveDestinoFase5',?,'definida','manual','manual')",
    [disciplinaId]
  );
  const [afetada] = await pool.execute(
    "INSERT INTO categorias (nome,categoria_pai_id,drive_pasta_id) VALUES ('Nome antigo',?,'driveSubarvoreFase5')",
    [categoriaId]
  );
  const [sincronizacoes] = await pool.execute(
    "SELECT id FROM sincronizacoes_google_drive ORDER BY id DESC LIMIT 1"
  );
  await pool.execute(
    "INSERT INTO materiais (drive_file_id,categoria_id,nome,mime_type,tipo,extensao,tamanho_bytes,"
    + "ultima_sincronizacao_drive_id) VALUES ('driveArquivoAntigoSubarvore',?,'antigo.pdf',"
    + "'application/pdf','pdf','pdf',10,?)",
    [Number(afetada.insertId), Number(sincronizacoes[0].id)]
  );
  await pool.execute(
    "INSERT INTO estado_changes_google_drive (id,page_token,atualizado_em) VALUES (1,'pagina-antiga',NOW(3))"
  );
  const repository = criarChangesRepository(pool, { nomeTrava: "plantel_changes_teste_acervo" });
  const alteracaoSubarvore = {
    fileId: "driveSubarvoreFase5",
    pastaRaizId: configuracao.googleDrive.pastaRaizId,
    subarvore: {
      pastas: [{
        id: "driveSubarvoreFase5",
        name: "Nome novo",
        mimeType: "application/vnd.google-apps.folder",
        parentId: "driveDestinoFase5",
        nivel: 0
      }, {
        id: "driveFilhaSubarvoreFase5",
        name: "Filha",
        mimeType: "application/vnd.google-apps.folder",
        parentId: "driveSubarvoreFase5",
        nivel: 1
      }],
      arquivos: [{
        id: "driveArquivoNovoSubarvore",
        name: "novo.pdf",
        mimeType: "application/pdf",
        size: "20",
        parentId: "driveFilhaSubarvoreFase5"
      }]
    }
  };
  const conexao = await repository.adquirirTrava();
  const resumo = await repository.aplicarAlteracoes(
    conexao,
    [alteracaoSubarvore],
    "pagina-nova"
  );
  await repository.liberarTrava(conexao);
  assert.equal(resumo.reconciliacaoNecessaria, false);
  const [pastas] = await pool.execute(
    "SELECT nome,categoria_pai_id,ativo FROM categorias WHERE drive_pasta_id='driveSubarvoreFase5'"
  );
  assert.equal(pastas[0].nome, "Nome novo");
  assert.equal(Number(pastas[0].categoria_pai_id), Number(destino.insertId));
  assert.equal(Number(pastas[0].ativo), 1);
  const [materiais] = await pool.execute(
    "SELECT drive_file_id,disponivel FROM materiais "
    + "WHERE drive_file_id IN ('driveArquivoAntigoSubarvore','driveArquivoNovoSubarvore') ORDER BY drive_file_id"
  );
  assert.deepEqual(materiais.map(function mapear(item) {
    return [item.drive_file_id, Number(item.disponivel)];
  }), [["driveArquivoAntigoSubarvore", 0], ["driveArquivoNovoSubarvore", 1]]);
  const catalogo = await criarAcervoRepository(pool).listarMateriais({
    categoriaId: Number(destino.insertId),
    pagina: 1,
    limite: 10,
    busca: "novo.pdf",
    tipo: null,
    disciplinaId: null,
    concursoId: null,
    ordenar: "nome_asc"
  });
  assert.equal(catalogo.itens[0].caminho, "Destino / Nome novo / Filha");
  assert.equal(catalogo.itens[0].disciplina.id, disciplinaId);
  const conexaoRepeticao = await repository.adquirirTrava();
  const repetida = await repository.aplicarAlteracoes(
    conexaoRepeticao,
    [alteracaoSubarvore],
    "pagina-repetida"
  );
  await repository.liberarTrava(conexaoRepeticao);
  assert.equal(repetida.reconciliacaoNecessaria, false);
  const [duplicados] = await pool.execute(
    "SELECT COUNT(*) AS total,COUNT(DISTINCT drive_file_id) AS distintos FROM materiais "
    + "WHERE drive_file_id='driveArquivoNovoSubarvore'"
  );
  assert.equal(Number(duplicados[0].total), 1);
  assert.equal(Number(duplicados[0].distintos), 1);

  const conexaoInsegura = await repository.adquirirTrava();
  const insegura = await repository.aplicarAlteracoes(conexaoInsegura, [{
    fileId: "driveSubarvoreInsegura",
    pastaRaizId: configuracao.googleDrive.pastaRaizId,
    subarvore: {
      pastas: [{
        id: "driveSubarvoreInsegura",
        name: "Insegura",
        mimeType: "application/vnd.google-apps.folder",
        parentId: "driveSubarvoreInsegura",
        nivel: 0
      }],
      arquivos: []
    }
  }], "pagina-insegura");
  await repository.liberarTrava(conexaoInsegura);
  assert.equal(insegura.reconciliacaoNecessaria, true);
  const [naoCriada] = await pool.execute(
    "SELECT COUNT(*) AS total FROM categorias WHERE drive_pasta_id='driveSubarvoreInsegura'"
  );
  assert.equal(Number(naoCriada[0].total), 0);

  const conexaoRemocao = await repository.adquirirTrava();
  const removida = await repository.aplicarAlteracoes(conexaoRemocao, [{
    fileId: "driveSubarvoreFase5",
    removerSubarvore: true
  }], "pagina-remocao");
  await repository.liberarTrava(conexaoRemocao);
  assert.equal(removida.reconciliacaoNecessaria, false);
  const [estadoPastas] = await pool.execute(
    "SELECT COUNT(*) AS ativas FROM categorias WHERE drive_pasta_id IN "
    + "('driveSubarvoreFase5','driveFilhaSubarvoreFase5') AND ativo=1"
  );
  assert.equal(Number(estadoPastas[0].ativas), 0);
});
