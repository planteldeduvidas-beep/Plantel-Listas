function criarAuditoriaController(service) {
  async function consultar(req, res, next) {
    try { res.status(200).json(await service.consultar(req.query)); } catch (erro) { next(erro); }
  }
  return { consultar: consultar };
}
module.exports = criarAuditoriaController;
