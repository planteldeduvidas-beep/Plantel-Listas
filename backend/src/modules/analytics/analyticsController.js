function criarAnalyticsController(service) {
  async function painel(req, res, next) {
    try { res.status(200).json(await service.obterPainel(req.query)); } catch (erro) { next(erro); }
  }
  async function relatorio(req, res, next) {
    try {
      const csv = await service.gerarCsv(req.query);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", "attachment; filename=relatorio-plantel-listas.csv");
      res.status(200).send(csv);
    } catch (erro) { next(erro); }
  }
  return { painel: painel, relatorio: relatorio };
}
module.exports = criarAnalyticsController;
