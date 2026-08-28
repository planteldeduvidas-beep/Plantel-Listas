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

function validarLote(corpo) {
  validarCamposPermitidos(corpo, ["categoriaIds"]);
  if (!Array.isArray(corpo.categoriaIds) || corpo.categoriaIds.length > 200) {
    throw new AppError("Pastas invalidas", 400, "DADOS_INVALIDOS");
  }
  const ids = corpo.categoriaIds.map(function mapear(id) { return validarId(id, "Pasta"); });
  if (new Set(ids).size !== ids.length) throw new AppError("Pastas repetidas", 400, "DADOS_INVALIDOS");
  return ids;
}

module.exports = {
  validarConcessao: validarConcessao,
  validarId: validarId,
  validarLote: validarLote
};
