function criarGoogleDriveChangesController(service) {
  async function webhook(req, res, next) {
    try {
      await service.receberNotificacao(req.headers);
      res.status(202).end();
    } catch (erro) {
      next(erro);
    }
  }

  async function status(req, res, next) {
    try {
      res.status(200).json({ acompanhamento: await service.obterStatus() });
    } catch (erro) {
      next(erro);
    }
  }

  async function renovar(req, res, next) {
    try {
      res.status(200).json({ acompanhamento: await service.renovarCanal() });
    } catch (erro) {
      next(erro);
    }
  }

  return { webhook: webhook, status: status, renovar: renovar };
}

module.exports = criarGoogleDriveChangesController;
