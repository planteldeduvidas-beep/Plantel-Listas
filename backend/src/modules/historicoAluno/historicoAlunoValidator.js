const AppError = require("../../shared/errors/AppError");

function validarConsulta(query) {
  const permitidos = ["pagina", "limite"];
  if (Object.keys(query || {}).some(function campoInvalido(chave) { return !permitidos.includes(chave); })) {
    throw new AppError("Filtros invalidos", 400, "FILTROS_INVALIDOS");
  }
  const pagina = query.pagina === undefined ? 1 : Number(query.pagina);
  const limite = query.limite === undefined ? 20 : Number(query.limite);
  if (!Number.isSafeInteger(pagina) || pagina < 1 || !Number.isSafeInteger(limite) || limite < 1 || limite > 50) {
    throw new AppError("Paginacao invalida", 400, "PAGINACAO_INVALIDA");
  }
  return { pagina: pagina, limite: limite };
}

module.exports = { validarConsulta: validarConsulta };
