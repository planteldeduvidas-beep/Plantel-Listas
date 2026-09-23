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
  validarCamposPermitidos(corpo, ["categoriaIds", "disciplinaIds"]);
  if (!Array.isArray(corpo.categoriaIds) || corpo.categoriaIds.length > 200) {
    throw new AppError("Pastas invalidas", 400, "DADOS_INVALIDOS");
  }
  const ids = corpo.categoriaIds.map(function mapear(id) { return validarId(id, "Pasta"); });
  if (new Set(ids).size !== ids.length) throw new AppError("Pastas repetidas", 400, "DADOS_INVALIDOS");
  if (corpo.disciplinaIds === undefined) return { categoriaIds: ids, disciplinaIds: null };
  if (!Array.isArray(corpo.disciplinaIds) || corpo.disciplinaIds.length > 200) {
    throw new AppError("Disciplinas invalidas", 400, "DADOS_INVALIDOS");
  }
  const disciplinaIds = corpo.disciplinaIds.map(function mapear(id) { return validarId(id, "Disciplina"); });
  if (new Set(disciplinaIds).size !== disciplinaIds.length) throw new AppError("Disciplinas repetidas", 400, "DADOS_INVALIDOS");
  return { categoriaIds: ids, disciplinaIds: disciplinaIds };
}

module.exports = {
  validarConcessao: validarConcessao,
  validarId: validarId,
  validarLote: validarLote
};
