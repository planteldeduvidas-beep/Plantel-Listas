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

  if (opcoes.body && !(opcoes.body instanceof FormData)) {
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

function listarEstruturaPublica() {
  return requisitar("/estrutura-acervo", { method: "GET" });
}

function listarUsuarios(filtros) {
  const parametros = new URLSearchParams();
  Object.keys(filtros || {}).forEach(function adicionar(chave) {
    if (filtros[chave] !== "" && filtros[chave] !== null && filtros[chave] !== undefined) parametros.set(chave, String(filtros[chave]));
  });
  return requisitar("/usuarios" + (parametros.toString() ? "?" + parametros.toString() : ""), { method: "GET" });
}

function criarUsuario(dados) { return requisitar("/usuarios", { method: "POST", body: JSON.stringify(dados) }); }
function editarUsuario(id, email) { return requisitar("/usuarios/" + id, { method: "PATCH", body: JSON.stringify({ email: email }) }); }
function alterarPapelUsuario(id, papel) { return requisitar("/usuarios/" + id + "/papel", { method: "PATCH", body: JSON.stringify({ papel: papel }) }); }
function alterarEstadoUsuario(id, ativo) { return requisitar("/usuarios/" + id + "/ativo", { method: "PATCH", body: JSON.stringify({ ativo: ativo }) }); }
function iniciarRedefinicaoUsuario(id) { return requisitar("/usuarios/" + id + "/redefinicao-senha", { method: "POST", body: JSON.stringify({}) }); }
function salvarAcessosProfessor(id, categoriaIds) { return requisitar("/permissoes/professores/" + id, { method: "PUT", body: JSON.stringify({ categoriaIds: categoriaIds }) }); }
function obterAnalytics(periodo) { return requisitar("/analytics?periodo=" + periodo, { method: "GET" }); }
function obterAuditoria(filtros) {
  const parametros = new URLSearchParams();
  Object.keys(filtros || {}).forEach(function adicionar(chave) { if (filtros[chave]) parametros.set(chave, String(filtros[chave])); });
  return requisitar("/auditoria" + (parametros.toString() ? "?" + parametros.toString() : ""), { method: "GET" });
}
function obterUrlRelatorio(periodo) { return API_BASE + "/analytics/relatorio.csv?periodo=" + periodo; }

function criarOperacoesDeCatalogo(caminho, nomeSingular) {
  return {
    listar: function listar() {
      return requisitar(caminho, { method: "GET" });
    },
    criar: function criar(dados) {
      return requisitar(caminho, {
        method: "POST",
        body: JSON.stringify(dados)
      });
    },
    editar: function editar(id, dados) {
      return requisitar(caminho + "/" + id, {
        method: "PATCH",
        body: JSON.stringify(dados)
      });
    },
    alterarAtivo: function alterarAtivo(id, ativo) {
      return requisitar(caminho + "/" + id + "/ativo", {
        method: "PATCH",
        body: JSON.stringify({ ativo: ativo })
      });
    },
    nomeSingular: nomeSingular
  };
}

const categorias = criarOperacoesDeCatalogo("/categorias", "categoria");
const disciplinas = criarOperacoesDeCatalogo("/disciplinas", "disciplina");
const concursos = criarOperacoesDeCatalogo("/concursos", "concurso");

function listarPermissoes() {
  return requisitar("/permissoes", { method: "GET" });
}

function listarMinhasPermissoes() {
  return requisitar("/permissoes/minhas", { method: "GET" });
}

function concederPermissao(professorId, categoriaId) {
  return requisitar("/permissoes", {
    method: "POST",
    body: JSON.stringify({ professorId: professorId, categoriaId: categoriaId })
  });
}

function revogarPermissao(permissaoId) {
  return requisitar("/permissoes/" + permissaoId, { method: "DELETE" });
}

function obterStatusGoogleDrive() {
  return requisitar("/integracoes/google-drive/status", { method: "GET" });
}

function iniciarOAuthGoogleDrive() {
  return requisitar("/integracoes/google-drive/oauth/iniciar", {
    method: "POST",
    body: JSON.stringify({})
  });
}

function sincronizarGoogleDrive() {
  return requisitar("/integracoes/google-drive/sincronizar", {
    method: "POST",
    body: JSON.stringify({})
  });
}

function obterStatusDasAtualizacoesGoogleDrive() {
  return requisitar("/integracoes/google-drive/changes/status", { method: "GET" });
}

function consultarAcervo(filtros) {
  const parametros = new URLSearchParams();
  Object.keys(filtros || {}).forEach(function adicionar(chave) {
    const valor = filtros[chave];
    if (valor !== null && valor !== undefined && valor !== "") {
      parametros.set(chave, String(valor));
    }
  });
  const query = parametros.toString();
  return requisitar("/acervo" + (query ? "?" + query : ""), { method: "GET" });
}

function obterUrlDoMaterial(materialId, baixar) {
  const id = Number(materialId);
  if (!Number.isInteger(id) || id < 1) {
    throw new Error("Material invalido");
  }
  return API_BASE + "/acervo/materiais/" + id + (baixar ? "/download" : "/conteudo");
}

function classificarPasta(categoriaId, disciplina, concurso) {
  return requisitar("/acervo/pastas/" + categoriaId + "/classificacao", {
    method: "PATCH",
    body: JSON.stringify({ disciplina: disciplina, concurso: concurso })
  });
}

function obterOrganizacaoAcervo() {
  return requisitar("/acervo/organizacao", { method: "GET" });
}

function classificarPastas(categoriaIds, disciplina, concurso) {
  const corpo = { categoriaIds: categoriaIds };
  if (disciplina) corpo.disciplina = disciplina;
  if (concurso) corpo.concurso = concurso;
  return requisitar("/acervo/organizacao", { method: "PATCH", body: JSON.stringify(corpo) });
}

function listarPastasGerenciaveis() {
  return requisitar("/gestao-materiais/pastas", { method: "GET" });
}

function adicionarMaterial(formulario) {
  return requisitar("/gestao-materiais", { method: "POST", body: formulario });
}

function editarMaterial(materialId, dados) {
  return requisitar("/gestao-materiais/" + materialId, { method: "PATCH", body: JSON.stringify(dados) });
}

function moverMaterial(materialId, categoriaId, versao) {
  return requisitar("/gestao-materiais/" + materialId + "/mover", {
    method: "PATCH", body: JSON.stringify({ categoriaId: categoriaId, versao: versao })
  });
}

function substituirMaterial(materialId, formulario) {
  return requisitar("/gestao-materiais/" + materialId + "/substituir", { method: "POST", body: formulario });
}

function enviarMaterialLixeira(materialId, versao) {
  return requisitar("/gestao-materiais/" + materialId + "/lixeira", {
    method: "POST", body: JSON.stringify({ versao: versao })
  });
}

function listarLixeira() {
  return requisitar("/gestao-materiais/lixeira", { method: "GET" });
}

function restaurarMaterial(materialId, versao) {
  return requisitar("/gestao-materiais/" + materialId + "/restaurar", {
    method: "POST", body: JSON.stringify({ versao: versao })
  });
}

function excluirMaterial(materialId, versao) {
  return requisitar("/gestao-materiais/" + materialId, {
    method: "DELETE", body: JSON.stringify({ versao: versao })
  });
}

export {
  cadastrar,
  entrar,
  sair,
  obterUsuarioAtual,
  solicitarRecuperacao,
  redefinirSenha,
  listarEstruturaPublica,
  listarUsuarios,
  criarUsuario,
  editarUsuario,
  alterarPapelUsuario,
  alterarEstadoUsuario,
  iniciarRedefinicaoUsuario,
  salvarAcessosProfessor,
  obterAnalytics,
  obterAuditoria,
  obterUrlRelatorio,
  categorias,
  disciplinas,
  concursos,
  listarPermissoes,
  listarMinhasPermissoes,
  concederPermissao,
  revogarPermissao,
  obterStatusGoogleDrive,
  iniciarOAuthGoogleDrive,
  sincronizarGoogleDrive,
  obterStatusDasAtualizacoesGoogleDrive,
  consultarAcervo,
  obterUrlDoMaterial,
  classificarPasta,
  obterOrganizacaoAcervo,
  classificarPastas,
  listarPastasGerenciaveis,
  adicionarMaterial,
  editarMaterial,
  moverMaterial,
  substituirMaterial,
  enviarMaterialLixeira,
  listarLixeira,
  restaurarMaterial,
  excluirMaterial
};

