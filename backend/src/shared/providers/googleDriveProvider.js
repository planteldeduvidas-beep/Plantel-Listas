const crypto = require("node:crypto");
const { OAuth2Client } = require("google-auth-library");
const AppError = require("../errors/AppError");

const MIME_PASTA = "application/vnd.google-apps.folder";
const ESCOPO_LEITURA = "https://www.googleapis.com/auth/drive.readonly";
const URL_API_DRIVE = "https://www.googleapis.com/drive/v3/files";
const TEMPO_LIMITE_REQUISICAO_MS = 30000;

async function executarComTempoLimite(tarefa, tempoLimite) {
  let temporizador;
  const limite = new Promise(function aguardarLimite(resolve, reject) {
    temporizador = setTimeout(function excederLimite() {
      reject(new Error("Tempo limite excedido"));
    }, tempoLimite);
  });

  try {
    return await Promise.race([tarefa, limite]);
  } finally {
    clearTimeout(temporizador);
  }
}

function validarConfiguracao(configuracao) {
  const campos = [
    configuracao.clientId,
    configuracao.clientSecret,
    configuracao.pastaRaizId,
    configuracao.redirectUri
  ];

  if (campos.some(function ausente(valor) { return !valor; })) {
    throw new AppError(
      "Integracao com Google Drive nao configurada",
      503,
      "GOOGLE_DRIVE_NAO_CONFIGURADO"
    );
  }

  if (!/^[a-zA-Z0-9_-]{10,255}$/.test(configuracao.pastaRaizId)) {
    throw new AppError(
      "Pasta raiz do Google Drive invalida",
      503,
      "GOOGLE_DRIVE_PASTA_RAIZ_INVALIDA"
    );
  }
}

function criarClienteOAuth(configuracao, fabricaInformada) {
  const FabricaOAuth = fabricaInformada || OAuth2Client;
  return new FabricaOAuth({
    clientId: configuracao.clientId,
    clientSecret: configuracao.clientSecret,
    redirectUri: configuracao.redirectUri
  });
}

function criarChaveDeCriptografia(segredoDaAplicacao) {
  return Buffer.from(crypto.hkdfSync(
    "sha256",
    Buffer.from(segredoDaAplicacao, "utf8"),
    Buffer.from("plantel-listas-google-drive", "utf8"),
    Buffer.from("refresh-token-v1", "utf8"),
    32
  ));
}

function criptografarRefreshToken(refreshToken, segredoDaAplicacao) {
  if (typeof refreshToken !== "string" || refreshToken.length < 10 || refreshToken.length > 4096) {
    throw new AppError("Refresh token Google invalido", 500, "GOOGLE_TOKEN_INVALIDO");
  }

  const vetorInicializacao = crypto.randomBytes(12);
  const cifra = crypto.createCipheriv(
    "aes-256-gcm",
    criarChaveDeCriptografia(segredoDaAplicacao),
    vetorInicializacao
  );
  const conteudo = Buffer.concat([
    cifra.update(refreshToken, "utf8"),
    cifra.final()
  ]);
  const autenticacao = cifra.getAuthTag();

  return [
    "v1",
    vetorInicializacao.toString("base64url"),
    autenticacao.toString("base64url"),
    conteudo.toString("base64url")
  ].join(".");
}

function descriptografarRefreshToken(valorCriptografado, segredoDaAplicacao) {
  try {
    const partes = valorCriptografado.split(".");
    if (partes.length !== 4 || partes[0] !== "v1") {
      throw new Error("Formato invalido");
    }

    const decifra = crypto.createDecipheriv(
      "aes-256-gcm",
      criarChaveDeCriptografia(segredoDaAplicacao),
      Buffer.from(partes[1], "base64url")
    );
    decifra.setAuthTag(Buffer.from(partes[2], "base64url"));
    return Buffer.concat([
      decifra.update(Buffer.from(partes[3], "base64url")),
      decifra.final()
    ]).toString("utf8");
  } catch (erro) {
    throw new AppError(
      "Credencial Google Drive indisponivel",
      503,
      "GOOGLE_CREDENCIAL_INVALIDA"
    );
  }
}

function criarGoogleDriveProvider(configuracao, dependenciasInformadas) {
  const dependencias = dependenciasInformadas || {};
  const buscar = dependencias.fetch || globalThis.fetch;
  const fabricaOAuth = dependencias.OAuth2Client;

  validarConfiguracao(configuracao);

  function gerarUrlAutorizacao(estado) {
    const cliente = criarClienteOAuth(configuracao, fabricaOAuth);
    return cliente.generateAuthUrl({
      access_type: "offline",
      scope: [ESCOPO_LEITURA],
      state: estado,
      include_granted_scopes: true,
      prompt: "consent"
    });
  }

  async function trocarCodigoPorRefreshToken(codigo) {
    if (typeof codigo !== "string" || codigo.length < 5 || codigo.length > 4096) {
      throw new AppError("Codigo OAuth invalido", 400, "GOOGLE_CODIGO_INVALIDO");
    }

    try {
      const cliente = criarClienteOAuth(configuracao, fabricaOAuth);
      const resultado = await cliente.getToken(codigo);
      const refreshToken = resultado.tokens && resultado.tokens.refresh_token;

      if (!refreshToken) {
        throw new AppError(
          "O Google nao forneceu autorizacao offline. Revogue o acesso anterior e tente novamente",
          409,
          "GOOGLE_REFRESH_TOKEN_AUSENTE"
        );
      }

      return refreshToken;
    } catch (erro) {
      if (erro instanceof AppError) {
        throw erro;
      }
      throw new AppError(
        "Nao foi possivel concluir a autorizacao Google",
        502,
        "GOOGLE_OAUTH_FALHOU"
      );
    }
  }

  async function obterTokenDeAcesso(refreshToken) {
    try {
      const cliente = criarClienteOAuth(configuracao, fabricaOAuth);
      cliente.setCredentials({ refresh_token: refreshToken });
      const resultado = await executarComTempoLimite(
        cliente.getAccessToken(),
        TEMPO_LIMITE_REQUISICAO_MS
      );
      const token = typeof resultado === "string" ? resultado : resultado.token;
      if (!token) {
        throw new Error("Token ausente");
      }
      return token;
    } catch (erro) {
      throw new AppError(
        "Autorizacao Google Drive invalida ou expirada",
        503,
        "GOOGLE_AUTORIZACAO_INVALIDA"
      );
    }
  }

  async function requisitarDrive(caminho, parametros, tokenDeAcesso) {
    const url = new URL(URL_API_DRIVE + caminho);
    Object.keys(parametros || {}).forEach(function adicionarParametro(nome) {
      const valor = parametros[nome];
      if (valor !== undefined && valor !== null && valor !== "") {
        url.searchParams.set(nome, String(valor));
      }
    });

    let resposta;
    try {
      resposta = await buscar(url, {
        method: "GET",
        headers: { Authorization: "Bearer " + tokenDeAcesso },
        signal: AbortSignal.timeout(TEMPO_LIMITE_REQUISICAO_MS)
      });
    } catch (erro) {
      throw new AppError(
        "Google Drive temporariamente indisponivel",
        503,
        "GOOGLE_DRIVE_INDISPONIVEL"
      );
    }

    if (!resposta.ok) {
      const codigo = resposta.status === 401 || resposta.status === 403
        ? "GOOGLE_AUTORIZACAO_INVALIDA"
        : "GOOGLE_DRIVE_INDISPONIVEL";
      throw new AppError("Nao foi possivel consultar o Google Drive", 503, codigo);
    }

    return resposta.json();
  }

  async function listarFilhos(pastaId, tokenDeAcesso) {
    const itens = [];
    let pageToken = "";

    do {
      const resposta = await requisitarDrive("", {
        q: "'" + pastaId + "' in parents and trashed = false",
        spaces: "drive",
        pageSize: 1000,
        pageToken: pageToken,
        orderBy: "name_natural",
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        fields: "nextPageToken,files(id,name,mimeType,size,md5Checksum,createdTime,modifiedTime,parents,webViewLink,resourceKey)"
      }, tokenDeAcesso);
      itens.push.apply(itens, resposta.files || []);
      pageToken = resposta.nextPageToken || "";
    } while (pageToken);

    return itens;
  }

  async function listarArvore(refreshToken) {
    const tokenDeAcesso = await obterTokenDeAcesso(refreshToken);
    const raiz = await requisitarDrive("/" + encodeURIComponent(configuracao.pastaRaizId), {
      supportsAllDrives: true,
      fields: "id,name,mimeType,trashed"
    }, tokenDeAcesso);

    if (raiz.trashed || raiz.mimeType !== MIME_PASTA || raiz.id !== configuracao.pastaRaizId) {
      throw new AppError(
        "Pasta raiz do Google Drive nao esta acessivel",
        503,
        "GOOGLE_DRIVE_RAIZ_INACESSIVEL"
      );
    }

    const pastas = [];
    const arquivos = [];
    const fila = [{ id: raiz.id, nivel: -1 }];

    for (let indice = 0; indice < fila.length; indice += 1) {
      const pastaAtual = fila[indice];
      const filhos = await listarFilhos(pastaAtual.id, tokenDeAcesso);

      filhos.forEach(function classificarItem(item) {
        const registro = Object.assign({}, item, {
          parentId: pastaAtual.id,
          nivel: pastaAtual.nivel + 1
        });
        if (item.mimeType === MIME_PASTA) {
          pastas.push(registro);
          fila.push({ id: item.id, nivel: registro.nivel });
        } else {
          arquivos.push(registro);
        }
      });
    }

    return {
      raiz: { id: raiz.id, nome: raiz.name },
      pastas: pastas,
      arquivos: arquivos
    };
  }

  return {
    escopo: ESCOPO_LEITURA,
    pastaRaizId: configuracao.pastaRaizId,
    gerarUrlAutorizacao: gerarUrlAutorizacao,
    trocarCodigoPorRefreshToken: trocarCodigoPorRefreshToken,
    listarArvore: listarArvore
  };
}

module.exports = {
  ESCOPO_LEITURA: ESCOPO_LEITURA,
  MIME_PASTA: MIME_PASTA,
  criarGoogleDriveProvider: criarGoogleDriveProvider,
  criptografarRefreshToken: criptografarRefreshToken,
  descriptografarRefreshToken: descriptografarRefreshToken
};
