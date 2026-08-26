const AppError = require("../../shared/errors/AppError");
const {
  validarId,
  validarCamposPermitidos
} = require("../categorias/estruturaAcervoValidator");

function validarConcessao(corpo) {
  validarCamposPermitidos(corpo, ["professorId", "categoriaId"]);

  if (Object.keys(corpo).length !== 2) {
    throw new AppError("Professor e categoria sao obrigatorios", 400, "DADOS_INVALIDOS");
  }

  return {
    professorId: validarId(corpo.professorId, "Professor"),
    categoriaId: validarId(corpo.categoriaId, "Categoria")
  };
}

module.exports = {
  validarConcessao: validarConcessao,
  validarId: validarId
};
