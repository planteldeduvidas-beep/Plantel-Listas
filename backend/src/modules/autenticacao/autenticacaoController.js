const {
  definirCookieDeSessao,
  limparCookieDeSessao
} = require("../../shared/utils/cookies");

function criarAutenticacaoController(service, configuracao, emailContaService, termosService) {
  async function cadastrar(req, res) {
    res.status(201).json(await service.cadastrar(req.body));
  }

  async function entrar(req, res) {
    const resultado = await service.entrar(req.body);
    definirCookieDeSessao(res, resultado.token, configuracao);
    res.status(200).json({ usuario: await emailContaService.obterAviso(resultado.usuario) });
  }

  async function sair(req, res) {
    await service.sair(req.sessao.tokenHash);
    limparCookieDeSessao(res, configuracao);
    res.status(204).send();
  }

  async function obterUsuarioAtual(req, res) {
    res.status(200).json({ usuario: await emailContaService.obterAviso(req.usuario) });
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
    obterTermos: async (req,res) => res.json(await termosService.obter(req.usuario)),
    aceitarTermos: async (req,res) => res.json(await termosService.aceitar(req.usuario,req.body)),
    solicitarConfirmacaoCadastro: async (req, res) => res.status(200).json(await emailContaService.solicitarCadastro(req.body)),
    confirmarCadastro: async (req, res) => res.status(200).json(await emailContaService.confirmarCadastro(req.body)),
    solicitarConfirmacaoEmail: async (req, res) => res.status(200).json(await emailContaService.solicitar(req.usuario, req.body)),
    confirmarEmail: async (req, res) => res.status(200).json(await emailContaService.confirmar(req.usuario, req.body)),
    cadastrar: cadastrar,
    entrar: entrar,
    sair: sair,
    obterUsuarioAtual: obterUsuarioAtual,
    solicitarRecuperacao: solicitarRecuperacao,
    redefinirSenha: redefinirSenha
  };
}

module.exports = criarAutenticacaoController;

