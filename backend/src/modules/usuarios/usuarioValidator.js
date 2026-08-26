const AppError = require("../../shared/errors/AppError");
const {
  exigirObjeto,
  validarCamposPermitidos
} = require("../autenticacao/autenticacaoValidator");

function validarUsuarioId(valor) {
  const usuarioId = Number(valor);

  if (!Number.isSafeInteger(usuarioId) || usuarioId <= 0) {
    throw new AppError("Usuario invalido", 400, "USUARIO_INVALIDO");
  }

  return usuarioId;
}

function validarAlteracaoDeAtivo(corpo) {
  exigirObjeto(corpo);
  validarCamposPermitidos(corpo, ["ativo"]);

  if (typeof corpo.ativo !== "boolean") {
    throw new AppError("Estado do usuario invalido", 400, "ESTADO_USUARIO_INVALIDO");
  }

  return { ativo: corpo.ativo };
}

function validarAlteracaoDePapel(corpo) {
  exigirObjeto(corpo);
  validarCamposPermitidos(corpo, ["papel"]);
  const papeisPermitidos = ["aluno", "professor", "admin"];

  if (!papeisPermitidos.includes(corpo.papel)) {
    throw new AppError("Papel invalido", 400, "PAPEL_INVALIDO");
  }

  return { papel: corpo.papel };
}

module.exports = {
  validarUsuarioId: validarUsuarioId,
  validarAlteracaoDeAtivo: validarAlteracaoDeAtivo,
  validarAlteracaoDePapel: validarAlteracaoDePapel
};

