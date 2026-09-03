function criarSuporteController(service) {
  async function enviar(req, res, next) {
    try {
      res.status(202).json(await service.enviar(req.usuario, req.body));
    } catch (erro) {
      next(erro);
    }
  }
  return { enviar: enviar };
}

module.exports = criarSuporteController;
