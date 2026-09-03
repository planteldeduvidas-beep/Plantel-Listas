const AREAS_POR_PAPEL = {
  aluno: ["acervo", "meuHistorico", "suporte"],
  professor: ["acervo", "minhasPastas", "suporte"],
  admin: ["estatisticas", "acervo", "usuarios", "acessos", "organizacao", "historico", "drive"]
};

function obterAreaInicial(papel) {
  return papel === "admin" ? "estatisticas" : "acervo";
}

function obterAreaPermitida(papel, pesquisa) {
  const parametros = new URLSearchParams(pesquisa || "");
  const area = parametros.get("area");
  const permitidas = AREAS_POR_PAPEL[papel] || ["acervo"];
  return permitidas.includes(area) ? area : obterAreaInicial(papel);
}

function obterPastaDaUrl(pesquisa) {
  const valor = new URLSearchParams(pesquisa || "").get("pasta");
  if (!valor || !/^\d+$/.test(valor) || Number(valor) < 1) return null;
  return Number(valor);
}

function criarUrlDaNavegacao(caminho, area, pasta) {
  const parametros = new URLSearchParams();
  parametros.set("area", area);
  if (area === "acervo" && pasta) parametros.set("pasta", String(pasta));
  return caminho + "?" + parametros.toString();
}

function limparParametrosTemporarios(caminho, pesquisa) {
  const parametros = new URLSearchParams(pesquisa || "");
  parametros.delete("tokenRecuperacao");
  parametros.delete("googleDrive");
  parametros.delete("oauthPopup");
  const restante = parametros.toString();
  return caminho + (restante ? "?" + restante : "");
}

export {
  criarUrlDaNavegacao,
  limparParametrosTemporarios,
  obterAreaInicial,
  obterAreaPermitida,
  obterPastaDaUrl
};
