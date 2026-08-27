const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ESCOPO_LEITURA,
  criarGoogleDriveProvider,
  criptografarRefreshToken,
  descriptografarRefreshToken
} = require("../src/shared/providers/googleDriveProvider");

class OAuth2ClientFake {
  constructor(configuracao) {
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

test("gera OAuth server-side com escopo unico de leitura e acesso offline", async function testarOAuth() {
  const provider = criarGoogleDriveProvider(criarConfiguracao(), {
    OAuth2Client: OAuth2ClientFake,
    fetch: async function buscarNaoUtilizado() { throw new Error("nao esperado"); }
  });
  const url = provider.gerarUrlAutorizacao("estado-seguro-de-teste");
  assert.equal(url.includes("estado-seguro-de-teste"), true);
  assert.deepEqual(OAuth2ClientFake.ultimaInstancia.opcoesAutorizacao.scope, [ESCOPO_LEITURA]);
  assert.equal(OAuth2ClientFake.ultimaInstancia.opcoesAutorizacao.access_type, "offline");
  assert.equal(OAuth2ClientFake.ultimaInstancia.opcoesAutorizacao.prompt, "consent");

  const token = await provider.trocarCodigoPorRefreshToken("codigo-valido-de-teste");
  assert.equal(token, "refresh-token-de-teste-seguro");
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
