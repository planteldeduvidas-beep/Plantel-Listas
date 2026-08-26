function criarPermissaoController(service) {
  async function listarTodas(req, res, next) {
    try {
      res.status(200).json({ permissoes: await service.listarTodas() });
    } catch (erro) {
      next(erro);
    }
  }

  async function listarMinhas(req, res, next) {
    try {
      res.status(200).json({ permissoes: await service.listarMinhas(req.usuario) });
    } catch (erro) {
      next(erro);
    }
  }

  async function conceder(req, res, next) {
    try {
      const permissao = await service.conceder(req.body, req.usuario);
      res.status(201).json({ permissao: permissao });
    } catch (erro) {
      next(erro);
    }
  }

  async function revogar(req, res, next) {
    try {
      const permissao = await service.revogar(req.params.id, req.usuario);
      res.status(200).json({ permissao: permissao });
    } catch (erro) {
      next(erro);
    }
  }

  return {
    listarTodas: listarTodas,
    listarMinhas: listarMinhas,
    conceder: conceder,
    revogar: revogar
  };
}

module.exports = criarPermissaoController;
