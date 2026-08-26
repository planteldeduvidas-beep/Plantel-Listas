const AppError = require("../errors/AppError");

function tratarRotaNaoEncontrada(req, res, next) {
  next(new AppError("Rota nao encontrada", 404, "ROTA_NAO_ENCONTRADA"));
}

module.exports = tratarRotaNaoEncontrada;

