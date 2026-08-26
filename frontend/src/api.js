const API_BASE = import.meta.env.VITE_API_URL || "/api";

let tokenCsrfEmMemoria = null;

async function lerResposta(resposta) {
  if (resposta.status === 204) {
    return null;
  }

  const tipo = resposta.headers.get("content-type") || "";
  if (tipo.includes("application/json")) {
    return resposta.json();
  }

  return null;
}

async function obterTokenCsrf() {
  if (tokenCsrfEmMemoria) {
    return tokenCsrfEmMemoria;
  }

  const resposta = await fetch(API_BASE + "/autenticacao/csrf", {
    credentials: "include"
  });
  const dados = await lerResposta(resposta);

  if (!resposta.ok || !dados || !dados.csrfToken) {
    throw new Error("Nao foi possivel iniciar a protecao da sessao");
  }

  tokenCsrfEmMemoria = dados.csrfToken;
  return tokenCsrfEmMemoria;
}

async function requisitar(caminho, opcoesInformadas) {
  const opcoes = Object.assign({}, opcoesInformadas || {});
  opcoes.credentials = "include";
  opcoes.headers = Object.assign({}, opcoes.headers || {});

  if (opcoes.body) {
    opcoes.headers["Content-Type"] = "application/json";
  }

  if (opcoes.method && opcoes.method !== "GET") {
    opcoes.headers["X-CSRF-Token"] = await obterTokenCsrf();
  }

  const resposta = await fetch(API_BASE + caminho, opcoes);
  const dados = await lerResposta(resposta);

  if (!resposta.ok) {
    const erro = new Error(
      dados && dados.erro ? dados.erro.mensagem : "Nao foi possivel concluir a operacao"
    );
    erro.codigo = dados && dados.erro ? dados.erro.codigo : "ERRO_REQUISICAO";
    erro.status = resposta.status;
    throw erro;
  }

  return dados;
}

function cadastrar(email, senha) {
  return requisitar("/autenticacao/cadastro", {
    method: "POST",
    body: JSON.stringify({ email: email, senha: senha })
  });
}

function entrar(email, senha) {
  return requisitar("/autenticacao/login", {
    method: "POST",
    body: JSON.stringify({ email: email, senha: senha })
  });
}

function sair() {
  return requisitar("/autenticacao/logout", { method: "POST" });
}

function obterUsuarioAtual() {
  return requisitar("/autenticacao/me", { method: "GET" });
}

function solicitarRecuperacao(email) {
  return requisitar("/autenticacao/recuperacao-senha/solicitar", {
    method: "POST",
    body: JSON.stringify({ email: email })
  });
}

function redefinirSenha(token, novaSenha) {
  return requisitar("/autenticacao/recuperacao-senha/redefinir", {
    method: "POST",
    body: JSON.stringify({ token: token, novaSenha: novaSenha })
  });
}

export {
  cadastrar,
  entrar,
  sair,
  obterUsuarioAtual,
  solicitarRecuperacao,
  redefinirSenha
};

