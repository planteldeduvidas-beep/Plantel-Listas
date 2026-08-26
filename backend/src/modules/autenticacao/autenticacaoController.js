const {
  definirCookieDeSessao,
  limparCookieDeSessao
} = require("../../shared/utils/cookies");

function criarAutenticacaoController(service, configuracao) {
  async function cadastrar(req, res) {
    const usuario = await service.cadastrar(req.body);
    res.status(201).json({ usuario: usuario });
  }

  async function entrar(req, res) {
    const resultado = await service.entrar(req.body);
    definirCookieDeSessao(res, resultado.token, configuracao);
    res.status(200).json({ usuario: resultado.usuario });
  }

  async function sair(req, res) {
    await service.sair(req.sessao.tokenHash);
    limparCookieDeSessao(res, configuracao);
    res.status(204).send();
  }

  function obterUsuarioAtual(req, res) {
    res.status(200).json({ usuario: req.usuario });
  }

  async function solicitarRecuperacao(req, res) {
    const resultado = await service.solicitarRecuperacao(req.body);
    res.status(200).json(resultado);
  }

  async function redefinirSenha(req, res) {
    const resultado = await service.redefinirSenha(req.body);
    limparCookieDeSessao(res, configuracao);
    res.status(200).json(resultado);
  }

  return {
    cadastrar: cadastrar,
    entrar: entrar,
    sair: sair,
    obterUsuarioAtual: obterUsuarioAtual,
    solicitarRecuperacao: solicitarRecuperacao,
    redefinirSenha: redefinirSenha
  };
}

module.exports = criarAutenticacaoController;

