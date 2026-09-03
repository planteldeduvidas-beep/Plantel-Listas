const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  ESCOPO_LEITURA,
  ESCOPO_GESTAO,
  criarGoogleDriveProvider,
  criptografarRefreshToken,
  descriptografarRefreshToken
} = require("../src/shared/providers/googleDriveProvider");

class OAuth2ClientFake {
  constructor(configuracao) {
    OAuth2ClientFake.instancias = (OAuth2ClientFake.instancias || 0) + 1;
    this.configuracao = configuracao;
    this.credenciais = null;
    OAuth2ClientFake.ultimaInstancia = this;
  }

  generateAuthUrl(opcoes) {
    this.opcoesAutorizacao = opcoes;
    return "https://accounts.google.test/oauth?state=" + opcoes.state;
  }

  async getToken(codigo) {
    this.codigo = codigo;
    return { tokens: { refresh_token: "refresh-token-de-teste-seguro" } };
  }

  setCredentials(credenciais) {
    this.credenciais = credenciais;
  }

  async getAccessToken() {
    return { token: "access-token-de-teste" };
  }
}

class OAuth2ClientComTokenRevogadoFake extends OAuth2ClientFake {
  async getAccessToken() {
    throw new Error("invalid_grant");
  }
}

function criarConfiguracao() {
  return {
    clientId: "cliente-de-teste.apps.googleusercontent.com",
    clientSecret: "segredo-cliente-de-teste",
    pastaRaizId: "pastaRaizTeste12345",
    redirectUri: "http://localhost:3000/api/integracoes/google-drive/oauth/callback"
  };
}

function criarResposta(dados) {
  return {
    ok: true,
    status: 200,
    json: async function retornarDados() {
      return dados;
    }
  };
}

test("gera OAuth server-side com escopo unico de gestao e acesso offline", async function testarOAuth() {
  const provider = criarGoogleDriveProvider(criarConfiguracao(), {
    OAuth2Client: OAuth2ClientFake,
    fetch: async function buscarNaoUtilizado() { throw new Error("nao esperado"); }
  });
  const url = provider.gerarUrlAutorizacao("estado-seguro-de-teste");
  assert.equal(url.includes("estado-seguro-de-teste"), true);
  assert.deepEqual(OAuth2ClientFake.ultimaInstancia.opcoesAutorizacao.scope, [ESCOPO_GESTAO]);
  assert.equal(provider.escopo, ESCOPO_GESTAO);
  assert.equal(provider.escopoGestaoNecessario, ESCOPO_GESTAO);
  assert.equal(OAuth2ClientFake.ultimaInstancia.opcoesAutorizacao.access_type, "offline");
  assert.equal(OAuth2ClientFake.ultimaInstancia.opcoesAutorizacao.prompt, "consent");

  const token = await provider.trocarCodigoPorRefreshToken("codigo-valido-de-teste");
  assert.equal(token, "refresh-token-de-teste-seguro");
});

test("prepara upload resumivel e alteracoes sem expor credenciais", async function testarEscritas() {
  OAuth2ClientFake.instancias = 0;
  const chamadas = [];
  const caminho = path.join(os.tmpdir(), "plantel-listas-provider-" + process.pid + ".pdf");
  await fs.writeFile(caminho, Buffer.from("%PDF-1.7\nteste"));
  try {
    const provider = criarGoogleDriveProvider(criarConfiguracao(), {
      OAuth2Client: OAuth2ClientFake,
      fetch: async function buscar(urlInformada, opcoes) {
        const url = new URL(urlInformada);
        let corpo = opcoes.body;
        if (corpo && typeof corpo[Symbol.asyncIterator] === "function") {
          const partes = [];
          for await (const parte of corpo) partes.push(parte);
          corpo = Buffer.concat(partes).toString("utf8");
        }
        chamadas.push({ url: url, metodo: opcoes.method, corpo: corpo, autorizacao: opcoes.headers.Authorization });
        if (url.pathname === "/upload/drive/v3/files") {
          return new Response(null, { status: 200, headers: { location: "https://upload.google.test/sessao-segura" } });
        }
        if (url.hostname === "upload.google.test") {
          return new Response(JSON.stringify({ id: "arquivoNovo123", name: "novo.pdf", mimeType: "application/pdf", size: "15" }), { status: 200, headers: { "content-type": "application/json" } });
        }
        if (opcoes.method === "DELETE") return new Response(null, { status: 204 });
        return new Response(JSON.stringify({ id: "arquivoNovo123" }), { status: 200, headers: { "content-type": "application/json" } });
      }
    });
    await provider.criarArquivo("refresh-token-secreto", { nome: "novo.pdf", mimeType: "application/pdf", tamanho: 15, caminho: caminho, pastaDriveId: "pastaDestino123" });
    await provider.renomearArquivo("refresh-token-secreto", "arquivoNovo123", "renomeado.pdf");
    await provider.moverArquivo("refresh-token-secreto", "arquivoNovo123", "pastaOrigem123", "pastaDestino123");
    await provider.alterarLixeira("refresh-token-secreto", "arquivoNovo123", true);
    await provider.excluirArquivo("refresh-token-secreto", "arquivoNovo123");
    assert.equal(OAuth2ClientFake.instancias, 1);
    assert.deepEqual(chamadas.map(function metodo(item) { return item.metodo; }), ["POST", "PUT", "PATCH", "PATCH", "PATCH", "DELETE"]);
    assert.equal(chamadas[0].corpo.includes("pastaDestino123"), true);
    assert.equal(String(chamadas[2].corpo).includes("renomeado.pdf"), true);
    assert.equal(chamadas[3].url.searchParams.get("addParents"), "pastaDestino123");
    assert.equal(String(chamadas[4].corpo).includes("true"), true);
    chamadas.forEach(function semSegredo(chamada) {
      assert.equal(JSON.stringify(chamada).includes("refresh-token-secreto"), false);
      assert.equal(chamada.autorizacao, "Bearer access-token-de-teste");
    });
  } finally {
    await fs.unlink(caminho).catch(function ignorar() {});
  }
});

test("cria pasta controlada com pai explicito", async function testarCriacaoDePasta() {
  let chamada;
  const provider = criarGoogleDriveProvider(criarConfiguracao(), {
    OAuth2Client: OAuth2ClientFake,
    fetch: async function buscar(urlInformada, opcoes) {
      chamada = { url: new URL(urlInformada), opcoes: opcoes };
      return new Response(JSON.stringify({
        id: "pastaTemporaria123",
        name: "TESTE FASE 6",
        mimeType: "application/vnd.google-apps.folder",
        parents: ["pastaRaizTeste12345"]
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });
  const pasta = await provider.criarPasta(
    "refresh-token-secreto",
    "TESTE FASE 6",
    "pastaRaizTeste12345"
  );
  assert.equal(pasta.id, "pastaTemporaria123");
  assert.equal(chamada.opcoes.method, "POST");
  assert.equal(JSON.parse(chamada.opcoes.body).parents[0], "pastaRaizTeste12345");
  assert.equal(JSON.stringify(chamada).includes("refresh-token-secreto"), false);
});

test("protege refresh token com criptografia autenticada", function testarCriptografia() {
  const segredo = "segredo-da-aplicacao-com-mais-de-trinta-e-dois-caracteres";
  const token = "refresh-token-que-nao-pode-ser-armazenado-em-texto";
  const criptografadoUm = criptografarRefreshToken(token, segredo);
  const criptografadoDois = criptografarRefreshToken(token, segredo);

  assert.equal(criptografadoUm.includes(token), false);
  assert.notEqual(criptografadoUm, criptografadoDois);
  assert.equal(descriptografarRefreshToken(criptografadoUm, segredo), token);
  assert.throws(function adulterar() {
    descriptografarRefreshToken(criptografadoUm + "x", segredo);
  }, /Credencial Google Drive indisponivel/);
});

test("traduz refresh token revogado sem expor o token", async function testarTokenRevogado() {
  const provider = criarGoogleDriveProvider(criarConfiguracao(), {
    OAuth2Client: OAuth2ClientComTokenRevogadoFake,
    fetch: async function buscarNaoUtilizado() { throw new Error("nao esperado"); }
  });
  const tokenRevogado = "refresh-token-revogado-e-secreto";

  await assert.rejects(
    provider.listarArvore(tokenRevogado),
    function validarErro(erro) {
      assert.equal(erro.codigo, "GOOGLE_AUTORIZACAO_INVALIDA");
      assert.equal(erro.message.includes(tokenRevogado), false);
      return true;
    }
  );
});

test("lista recursivamente apenas descendentes da raiz e respeita paginacao", async function testarArvore() {
  const consultas = [];
  const configuracao = criarConfiguracao();

  async function buscar(urlInformada, opcoes) {
    const url = new URL(urlInformada);
    consultas.push({ url: url, autorizacao: opcoes.headers.Authorization });

    if (url.pathname.endsWith("/files/" + configuracao.pastaRaizId)) {
      return criarResposta({
        id: configuracao.pastaRaizId,
        name: "Acervo",
        mimeType: "application/vnd.google-apps.folder",
        trashed: false
      });
    }

    const query = url.searchParams.get("q") || "";
    const pagina = url.searchParams.get("pageToken") || "";
    if (query.includes(configuracao.pastaRaizId) && !pagina) {
      return criarResposta({
        nextPageToken: "pagina-dois",
        files: [{
          id: "pastaListas12345",
          name: "LISTAS",
          mimeType: "application/vnd.google-apps.folder"
        }]
      });
    }
    if (query.includes(configuracao.pastaRaizId) && pagina === "pagina-dois") {
      return criarResposta({
        files: [{
          id: "arquivoRaiz12345",
          name: "aviso.pdf",
          mimeType: "application/pdf",
          size: "100"
        }]
      });
    }
    if (query.includes("pastaListas12345")) {
      return criarResposta({
        files: [{
          id: "arquivoLista12345",
          name: "lista-01.pdf",
          mimeType: "application/pdf",
          size: "200"
        }]
      });
    }
    throw new Error("Consulta inesperada");
  }

  const provider = criarGoogleDriveProvider(configuracao, {
    OAuth2Client: OAuth2ClientFake,
    fetch: buscar
  });
  const arvore = await provider.listarArvore("refresh-token-de-teste");

  assert.equal(arvore.raiz.id, configuracao.pastaRaizId);
  assert.equal(arvore.pastas.length, 1);
  assert.equal(arvore.pastas[0].parentId, configuracao.pastaRaizId);
  assert.equal(arvore.arquivos.length, 2);
  assert.equal(arvore.arquivos[1].parentId, "pastaListas12345");
  assert.equal(consultas.length, 4);
  consultas.forEach(function validarConsulta(consulta) {
    assert.equal(consulta.autorizacao, "Bearer access-token-de-teste");
    const query = consulta.url.searchParams.get("q");
    if (query) {
      assert.equal(
        query.includes(configuracao.pastaRaizId) || query.includes("pastaListas12345"),
        true
      );
    }
  });
});

test("verifica canDownload antes de transmitir e preserva Range", async function testarDownloadPermitido() {
  const chamadas = [];
  const provider = criarGoogleDriveProvider(criarConfiguracao(), {
    OAuth2Client: OAuth2ClientFake,
    fetch: async function buscar(urlInformada, opcoes) {
      const url = new URL(urlInformada);
      chamadas.push({ url: url, range: opcoes.headers.Range || null });
      if (url.searchParams.get("alt") === "media") {
        return new Response(Buffer.from("0123"), {
          status: 206,
          headers: { "content-range": "bytes 0-3/10" }
        });
      }
      return criarResposta({
        id: "arquivoSeguro12345",
        trashed: false,
        capabilities: { canDownload: true }
      });
    }
  });
  const resposta = await provider.obterConteudoArquivo(
    "refresh-token-de-teste",
    "arquivoSeguro12345",
    "bytes=0-3"
  );
  assert.equal(resposta.status, 206);
  assert.equal(chamadas.length, 2);
  assert.equal(chamadas[0].url.searchParams.get("fields"), "id,trashed,capabilities(canDownload)");
  assert.equal(chamadas[1].range, "bytes=0-3");
});

test("recusa arquivo sem capacidade de download com erro funcional", async function testarDownloadNegado() {
  let chamadas = 0;
  const provider = criarGoogleDriveProvider(criarConfiguracao(), {
    OAuth2Client: OAuth2ClientFake,
    fetch: async function buscar() {
      chamadas += 1;
      return criarResposta({
        id: "arquivoBloqueado12345",
        trashed: false,
        capabilities: { canDownload: false }
      });
    }
  });
  await assert.rejects(
    provider.obterConteudoArquivo(
      "refresh-token-de-teste",
      "arquivoBloqueado12345",
      null
    ),
    function validar(erro) {
      assert.equal(erro.statusCode, 403);
      assert.equal(erro.codigo, "MATERIAL_DOWNLOAD_NAO_PERMITIDO");
      assert.match(erro.message, /nao esta liberado/);
      return true;
    }
  );
  assert.equal(chamadas, 1);
});

test("lista somente a subarvore afetada e nao segue atalhos", async function testarSubarvore() {
  const consultas = [];
  const provider = criarGoogleDriveProvider(criarConfiguracao(), {
    OAuth2Client: OAuth2ClientFake,
    fetch: async function buscar(urlInformada) {
      const url = new URL(urlInformada);
      const query = url.searchParams.get("q") || "";
      consultas.push(query);
      if (query.includes("pastaAfetada12345")) {
        return criarResposta({ files: [{
          id: "pastaFilha12345",
          name: "Filha",
          mimeType: "application/vnd.google-apps.folder"
        }, {
          id: "atalhoExterno12345",
          name: "Atalho",
          mimeType: "application/vnd.google-apps.shortcut"
        }] });
      }
      if (query.includes("pastaFilha12345")) {
        return criarResposta({ files: [{
          id: "arquivoFilho12345",
          name: "lista.pdf",
          mimeType: "application/pdf"
        }] });
      }
      throw new Error("Consulta inesperada");
    }
  });
  const resultado = await provider.listarSubarvore("refresh-token-de-teste", {
    id: "pastaAfetada12345",
    name: "Afetada",
    mimeType: "application/vnd.google-apps.folder",
    parents: ["pastaRaizTeste12345"]
  });
  assert.deepEqual(resultado.pastas.map(function id(item) { return item.id; }), [
    "pastaAfetada12345",
    "pastaFilha12345"
  ]);
  assert.deepEqual(resultado.arquivos.map(function id(item) { return item.id; }), [
    "arquivoFilho12345"
  ]);
  assert.equal(consultas.some(function contem(consulta) {
    return consulta.includes("atalhoExterno12345");
  }), false);
});
