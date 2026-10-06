function criarSuporteController(service) {
  async function enviar(req, res, next) {
    try {
      res.status(202).json(await service.enviar(req.usuario, req.body));
    } catch (erro) {
      next(erro);
    }
  }
  async function ajudaConta(req, res, next) {
    try {
      await service.ajudaConta(req.body);
      res.status(202).json({ mensagem: "Mensagem enviada. Responderemos em ate 24 horas pelo e-mail de contato informado. Confira tambem Spam ou Lixo eletronico." });
    } catch (erro) { next(erro); }
  }
  return { enviar: enviar, ajudaConta: ajudaConta };
}

module.exports = criarSuporteController;
