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
    escopoLeitura: ESCOPO_LEITURA
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
    "INSERT INTO categorias (nome,drive_pasta_id,disciplina_id,classificacao_origem) VALUES ('Listas','drivePastaFase5',?,'manual')",
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
    .set("X-CSRF-Token", aluno.csrf).send({ disciplinaId: null, concursoId: null });
  assert.equal(proibido.status, 403);

  const admin = await autenticar("admin");
  const semCsrf = await admin.agente.patch("/api/acervo/pastas/" + categoriaId + "/classificacao")
    .send({ disciplinaId: null, concursoId: null });
  assert.equal(semCsrf.status, 403);
  const excesso = await admin.agente.patch("/api/acervo/pastas/" + categoriaId + "/classificacao")
    .set("X-CSRF-Token", admin.csrf).send({ disciplinaId: null, concursoId: null, driveFileId: "nao" });
  assert.equal(excesso.status, 400);
});

test("acervo exige sessao e rejeita parametros fora da allowlist", async function testarProtecoes() {
  assert.equal((await request(aplicacao).get("/api/acervo")).status, 401);
  const autenticado = await autenticar("aluno");
  assert.equal((await autenticado.agente.get("/api/acervo?ordenar=DROP_TABLE")).status, 400);
  assert.equal((await autenticado.agente.get("/api/acervo?driveFileId=qualquer")).status, 400);
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
