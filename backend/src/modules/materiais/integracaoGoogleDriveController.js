function criarIntegracaoGoogleDriveController(service, configuracao) {
  async function iniciarOAuth(req, res, next) {
    try {
      const resultado = await service.iniciarOAuth(req.usuario.id, req.body);
      res.status(200).json(resultado);
    } catch (erro) {
      next(erro);
    }
  }

  async function concluirOAuth(req, res, next) {
    try {
      await service.concluirOAuth(req.usuario.id, req.query);
      res.redirect(303, configuracao.frontendUrl + "/?googleDrive=conectado");
    } catch (erro) {
      next(erro);
    }
  }

  async function obterStatus(req, res, next) {
    try {
      const status = await service.obterStatus();
      res.status(200).json({ googleDrive: status });
    } catch (erro) {
      next(erro);
    }
  }

  async function sincronizar(req, res, next) {
    try {
      const sincronizacao = await service.solicitarSincronizacao(
        req.usuario.id,
        req.body
      );
      res.status(202).json({ sincronizacao: sincronizacao });
    } catch (erro) {
      next(erro);
    }
  }

  return {
    iniciarOAuth: iniciarOAuth,
    concluirOAuth: concluirOAuth,
    obterStatus: obterStatus,
    sincronizar: sincronizar
  };
}

module.exports = criarIntegracaoGoogleDriveController;
