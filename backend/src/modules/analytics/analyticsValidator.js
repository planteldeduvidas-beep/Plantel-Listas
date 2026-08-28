const AppError = require("../../shared/errors/AppError");

function validarPeriodo(valor) {
  const periodo = valor === undefined ? 30 : Number(valor);
  if (![7, 30, 90].includes(periodo)) {
    throw new AppError("Periodo invalido", 400, "PERIODO_INVALIDO");
  }
  return periodo;
}

function validarQuery(query) {
  const extras = Object.keys(query || {}).filter(function filtrar(chave) { return chave !== "periodo"; });
  if (extras.length) throw new AppError("Filtros invalidos", 400, "FILTROS_INVALIDOS");
  return { periodo: validarPeriodo(query && query.periodo) };
}

module.exports = { validarQuery: validarQuery };
