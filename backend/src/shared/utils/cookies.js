function criarOpcoesBaseDoCookie(configuracao) {
  return {
    secure: configuracao.ambiente === "production",
    sameSite: "lax",
    path: "/"
  };
}

function definirCookieDeSessao(res, token, configuracao) {
  const opcoes = criarOpcoesBaseDoCookie(configuracao);
  opcoes.httpOnly = true;
  opcoes.maxAge = configuracao.seguranca.duracaoSessaoHoras * 60 * 60 * 1000;
  res.cookie(configuracao.seguranca.nomeCookieSessao, token, opcoes);
}

function limparCookieDeSessao(res, configuracao) {
  const opcoes = criarOpcoesBaseDoCookie(configuracao);
  opcoes.httpOnly = true;
  res.clearCookie(configuracao.seguranca.nomeCookieSessao, opcoes);
}

function definirCookieCsrf(res, token, configuracao) {
  const opcoes = criarOpcoesBaseDoCookie(configuracao);
  opcoes.httpOnly = true;
  opcoes.maxAge = 8 * 60 * 60 * 1000;
  res.cookie(configuracao.seguranca.nomeCookieCsrf, token, opcoes);
}

module.exports = {
  definirCookieDeSessao: definirCookieDeSessao,
  limparCookieDeSessao: limparCookieDeSessao,
  definirCookieCsrf: definirCookieCsrf
};

