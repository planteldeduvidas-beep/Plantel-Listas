const crypto = require("node:crypto");
const fs = require("node:fs");
const { OAuth2Client } = require("google-auth-library");
const AppError = require("../errors/AppError");

const MIME_PASTA = "application/vnd.google-apps.folder";
const ESCOPO_LEITURA = "https://www.googleapis.com/auth/drive.readonly";
const ESCOPO_GESTAO = "https://www.googleapis.com/auth/drive";
const URL_API_DRIVE = "https://www.googleapis.com/drive/v3/files";
const URL_CHANGES_DRIVE = "https://www.googleapis.com/drive/v3/changes";
const URL_CHANNELS_DRIVE = "https://www.googleapis.com/drive/v3/channels/stop";
const MIME_ATALHO = "application/vnd.google-apps.shortcut";
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
      scope: [ESCOPO_GESTAO],
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

  async function obterConteudoArquivo(refreshToken, arquivoId, intervalo) {
    const tokenDeAcesso = await obterTokenDeAcesso(refreshToken);
    const metadados = await requisitarDrive("/" + encodeURIComponent(arquivoId), {
      supportsAllDrives: true,
      fields: "id,trashed,capabilities(canDownload)"
    }, tokenDeAcesso);
    if (metadados.trashed || !metadados.capabilities || metadados.capabilities.canDownload !== true) {
      throw new AppError(
        "Este arquivo nao esta liberado para download",
        403,
        "MATERIAL_DOWNLOAD_NAO_PERMITIDO"
      );
    }
    const url = new URL(URL_API_DRIVE + "/" + encodeURIComponent(arquivoId));
    url.searchParams.set("alt", "media");
    url.searchParams.set("supportsAllDrives", "true");
    const headers = { Authorization: "Bearer " + tokenDeAcesso };
    if (intervalo) {
      headers.Range = intervalo;
    }

    let resposta;
    try {
      resposta = await buscar(url, {
        method: "GET",
        headers: headers,
        signal: AbortSignal.timeout(TEMPO_LIMITE_REQUISICAO_MS)
      });
    } catch (erro) {
      throw new AppError(
        "Google Drive temporariamente indisponivel",
        503,
        "GOOGLE_DRIVE_INDISPONIVEL"
      );
    }

    if (![200, 206, 416].includes(resposta.status)) {
      const codigo = resposta.status === 401
        ? "GOOGLE_AUTORIZACAO_INVALIDA"
        : resposta.status === 403
          ? "MATERIAL_DOWNLOAD_NAO_PERMITIDO"
          : "GOOGLE_DRIVE_INDISPONIVEL";
      throw new AppError(
        codigo === "MATERIAL_DOWNLOAD_NAO_PERMITIDO"
          ? "Este arquivo nao esta liberado para download"
          : "Nao foi possivel obter o arquivo",
        codigo === "MATERIAL_DOWNLOAD_NAO_PERMITIDO" ? 403 : 503,
        codigo
      );
    }
    return resposta;
  }

  async function requisitarJson(url, opcoes, tokenDeAcesso) {
    const configuracaoFetch = Object.assign({}, opcoes || {});
    configuracaoFetch.headers = Object.assign({}, configuracaoFetch.headers || {}, {
      Authorization: "Bearer " + tokenDeAcesso,
      "Content-Type": "application/json"
    });
    configuracaoFetch.signal = AbortSignal.timeout(TEMPO_LIMITE_REQUISICAO_MS);
    let resposta;
    try {
      resposta = await buscar(url, configuracaoFetch);
    } catch (erro) {
      throw new AppError("Google Drive temporariamente indisponivel", 503, "GOOGLE_DRIVE_INDISPONIVEL");
    }
    if (!resposta.ok) {
      const codigo = resposta.status === 401 || resposta.status === 403
        ? "GOOGLE_AUTORIZACAO_INVALIDA"
        : resposta.status === 410
          ? "GOOGLE_PAGE_TOKEN_EXPIRADO"
          : "GOOGLE_DRIVE_INDISPONIVEL";
      throw new AppError("Nao foi possivel consultar alteracoes do Google Drive", 503, codigo);
    }
    if (resposta.status === 204) {
      return {};
    }
    return resposta.json();
  }

  async function requisitarEscrita(url, opcoes, tokenDeAcesso) {
    const configuracaoFetch = Object.assign({}, opcoes || {});
    configuracaoFetch.headers = Object.assign({}, configuracaoFetch.headers || {}, {
      Authorization: "Bearer " + tokenDeAcesso
    });
    configuracaoFetch.signal = AbortSignal.timeout(TEMPO_LIMITE_REQUISICAO_MS);
    if (configuracaoFetch.body && typeof configuracaoFetch.body.pipe === "function") {
      configuracaoFetch.duplex = "half";
    }
    let resposta;
    try {
      resposta = await buscar(url, configuracaoFetch);
    } catch (erro) {
      throw new AppError("Google Drive temporariamente indisponivel", 503, "GOOGLE_DRIVE_INDISPONIVEL");
    }
    if (!resposta.ok) {
      const codigo = resposta.status === 401 || resposta.status === 403
        ? "GOOGLE_AUTORIZACAO_INVALIDA"
        : resposta.status === 404
          ? "GOOGLE_ARQUIVO_NAO_ENCONTRADO"
          : "GOOGLE_DRIVE_INDISPONIVEL";
      throw new AppError("Nao foi possivel alterar o Google Drive", resposta.status === 404 ? 409 : 503, codigo);
    }
    return resposta.status === 204 ? {} : resposta.json();
  }

  async function criarArquivo(refreshToken, dados) {
    const token = await obterTokenDeAcesso(refreshToken);
    const iniciarUrl = new URL("https://www.googleapis.com/upload/drive/v3/files");
    iniciarUrl.searchParams.set("uploadType", "resumable");
    iniciarUrl.searchParams.set("supportsAllDrives", "true");
    iniciarUrl.searchParams.set("fields", "id,name,mimeType,size,md5Checksum,createdTime,modifiedTime,parents,resourceKey");
    let inicio;
    try {
      inicio = await buscar(iniciarUrl, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": dados.mimeType,
          "X-Upload-Content-Length": String(dados.tamanho)
        },
        body: JSON.stringify({ name: dados.nome, mimeType: dados.mimeType, parents: [dados.pastaDriveId] }),
        signal: AbortSignal.timeout(TEMPO_LIMITE_REQUISICAO_MS)
      });
    } catch (erro) {
      throw new AppError("Google Drive temporariamente indisponivel", 503, "GOOGLE_DRIVE_INDISPONIVEL");
    }
    if (!inicio.ok || !inicio.headers.get("location")) {
      throw new AppError("Nao foi possivel iniciar o envio ao Google Drive", 503, inicio.status === 401 || inicio.status === 403 ? "GOOGLE_AUTORIZACAO_INVALIDA" : "GOOGLE_DRIVE_INDISPONIVEL");
    }
    return requisitarEscrita(new URL(inicio.headers.get("location")), {
      method: "PUT",
      headers: { "Content-Type": dados.mimeType, "Content-Length": String(dados.tamanho) },
      body: fs.createReadStream(dados.caminho)
    }, token);
  }

  async function atualizarMetadados(refreshToken, arquivoId, metadados, parametros) {
    const token = await obterTokenDeAcesso(refreshToken);
    const url = new URL(URL_API_DRIVE + "/" + encodeURIComponent(arquivoId));
    url.searchParams.set("supportsAllDrives", "true");
    url.searchParams.set("fields", "id,name,mimeType,size,md5Checksum,createdTime,modifiedTime,parents,trashed,resourceKey");
    Object.keys(parametros || {}).forEach(function adicionar(chave) { url.searchParams.set(chave, parametros[chave]); });
    return requisitarEscrita(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metadados)
    }, token);
  }

  function renomearArquivo(refreshToken, arquivoId, nome) {
    return atualizarMetadados(refreshToken, arquivoId, { name: nome });
  }

  function moverArquivo(refreshToken, arquivoId, pastaAnteriorDriveId, pastaNovaDriveId) {
    return atualizarMetadados(refreshToken, arquivoId, {}, {
      addParents: pastaNovaDriveId,
      removeParents: pastaAnteriorDriveId
    });
  }

  function alterarLixeira(refreshToken, arquivoId, naLixeira) {
    return atualizarMetadados(refreshToken, arquivoId, { trashed: Boolean(naLixeira) });
  }

  async function excluirArquivo(refreshToken, arquivoId) {
    const token = await obterTokenDeAcesso(refreshToken);
    const url = new URL(URL_API_DRIVE + "/" + encodeURIComponent(arquivoId));
    url.searchParams.set("supportsAllDrives", "true");
    return requisitarEscrita(url, { method: "DELETE" }, token);
  }

  async function obterInicioDasAlteracoes(refreshToken) {
    const token = await obterTokenDeAcesso(refreshToken);
    const url = new URL(URL_CHANGES_DRIVE + "/startPageToken");
    url.searchParams.set("supportsAllDrives", "true");
    const resposta = await requisitarJson(url, { method: "GET" }, token);
    return resposta.startPageToken;
  }

  async function listarAlteracoes(refreshToken, pageToken) {
    const token = await obterTokenDeAcesso(refreshToken);
    const url = new URL(URL_CHANGES_DRIVE);
    url.searchParams.set("pageToken", pageToken);
    url.searchParams.set("pageSize", "1000");
    url.searchParams.set("spaces", "drive");
    url.searchParams.set("includeRemoved", "true");
    url.searchParams.set("supportsAllDrives", "true");
    url.searchParams.set("includeItemsFromAllDrives", "true");
    url.searchParams.set("fields", "nextPageToken,newStartPageToken,changes(fileId,removed,file(id,name,mimeType,size,md5Checksum,createdTime,modifiedTime,parents,trashed,resourceKey))");
    return requisitarJson(url, { method: "GET" }, token);
  }

  async function observarAlteracoes(refreshToken, pageToken, canal) {
    const token = await obterTokenDeAcesso(refreshToken);
    const url = new URL(URL_CHANGES_DRIVE + "/watch");
    url.searchParams.set("pageToken", pageToken);
    url.searchParams.set("supportsAllDrives", "true");
    return requisitarJson(url, {
      method: "POST",
      body: JSON.stringify({
        id: canal.id,
        type: "web_hook",
        address: canal.address,
        token: canal.token,
        expiration: String(canal.expiration)
      })
    }, token);
  }

  async function encerrarCanal(refreshToken, canalId, resourceId) {
    const token = await obterTokenDeAcesso(refreshToken);
    return requisitarJson(new URL(URL_CHANNELS_DRIVE), {
      method: "POST",
      body: JSON.stringify({ id: canalId, resourceId: resourceId })
    }, token);
  }

  async function obterItem(refreshToken, arquivoId) {
    const token = await obterTokenDeAcesso(refreshToken);
    return requisitarDrive("/" + encodeURIComponent(arquivoId), {
      supportsAllDrives: true,
      fields: "id,name,mimeType,size,md5Checksum,createdTime,modifiedTime,parents,trashed,resourceKey"
    }, token);
  }

  async function verificarDescendenteDaRaiz(refreshToken, item) {
    if (!item || item.trashed || item.mimeType === MIME_ATALHO) {
      return false;
    }
    const visitados = new Set();
    let atual = item;
    for (let nivel = 0; nivel < 50; nivel += 1) {
      const pais = atual.parents || [];
      if (pais.includes(configuracao.pastaRaizId)) {
        return true;
      }
      if (pais.length !== 1 || visitados.has(pais[0])) {
        return false;
      }
      visitados.add(pais[0]);
      atual = await obterItem(refreshToken, pais[0]);
      if (atual.mimeType === MIME_ATALHO || atual.trashed) {
        return false;
      }
    }
    return false;
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

  async function listarSubarvore(refreshToken, pasta) {
    const tokenDeAcesso = await obterTokenDeAcesso(refreshToken);
    if (!pasta || pasta.mimeType !== MIME_PASTA || pasta.trashed) {
      throw new AppError(
        "Pasta do Google Drive invalida",
        409,
        "GOOGLE_SUBARVORE_INVALIDA"
      );
    }

    const pastas = [Object.assign({}, pasta, {
      parentId: pasta.parents && pasta.parents[0] ? pasta.parents[0] : null,
      nivel: 0
    })];
    const arquivos = [];
    const fila = [{ id: pasta.id, nivel: 0 }];

    for (let indice = 0; indice < fila.length; indice += 1) {
      const pastaAtual = fila[indice];
      const filhos = await listarFilhos(pastaAtual.id, tokenDeAcesso);
      filhos.forEach(function classificar(item) {
        if (item.mimeType === MIME_ATALHO) {
          return;
        }
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

    return { pastas: pastas, arquivos: arquivos };
  }

  return {
    escopo: ESCOPO_GESTAO,
    escopoGestaoNecessario: ESCOPO_GESTAO,
    pastaRaizId: configuracao.pastaRaizId,
    gerarUrlAutorizacao: gerarUrlAutorizacao,
    trocarCodigoPorRefreshToken: trocarCodigoPorRefreshToken,
    listarArvore: listarArvore,
    listarSubarvore: listarSubarvore,
    obterConteudoArquivo: obterConteudoArquivo,
    obterTokenDeAcesso: obterTokenDeAcesso,
    obterInicioDasAlteracoes: obterInicioDasAlteracoes,
    listarAlteracoes: listarAlteracoes,
    observarAlteracoes: observarAlteracoes,
    encerrarCanal: encerrarCanal,
    obterItem: obterItem,
    verificarDescendenteDaRaiz: verificarDescendenteDaRaiz,
    criarArquivo: criarArquivo,
    renomearArquivo: renomearArquivo,
    moverArquivo: moverArquivo,
    alterarLixeira: alterarLixeira,
    excluirArquivo: excluirArquivo
  };
}

module.exports = {
  ESCOPO_LEITURA: ESCOPO_LEITURA,
  ESCOPO_GESTAO: ESCOPO_GESTAO,
  MIME_PASTA: MIME_PASTA,
  criarGoogleDriveProvider: criarGoogleDriveProvider,
  criptografarRefreshToken: criptografarRefreshToken,
  descriptografarRefreshToken: descriptografarRefreshToken
};
