const AppError = require("../../shared/errors/AppError");

function validarCorpoVazio(corpo) {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
    throw new AppError("Corpo da requisicao invalido", 400, "DADOS_INVALIDOS");
  }

  if (Object.keys(corpo).length > 0) {
    throw new AppError("Esta operacao nao aceita campos", 400, "CAMPO_NAO_PERMITIDO");
  }
}

function validarCallbackOAuth(query) {
  if (query.error) {
    throw new AppError(
      "Autorizacao Google cancelada ou recusada",
      400,
      "GOOGLE_OAUTH_RECUSADO"
    );
  }

  const codigo = query.code;
  const estado = query.state;
  if (typeof codigo !== "string" || codigo.length < 5 || codigo.length > 4096) {
    throw new AppError("Codigo OAuth invalido", 400, "GOOGLE_CODIGO_INVALIDO");
  }
  if (typeof estado !== "string" || !/^[a-zA-Z0-9_-]{40,100}$/.test(estado)) {
    throw new AppError("Estado OAuth invalido", 400, "GOOGLE_ESTADO_INVALIDO");
  }

  return { codigo: codigo, estado: estado };
}

module.exports = {
  validarCorpoVazio: validarCorpoVazio,
  validarCallbackOAuth: validarCallbackOAuth
};
