function criarHistoricoAlunoController(service) {
  async function listar(req, res, next) {
    try {
      res.status(200).json(await service.listar(req.usuario, req.query));
    } catch (erro) {
      next(erro);
    }
  }
  return { listar: listar };
}

module.exports = criarHistoricoAlunoController;
