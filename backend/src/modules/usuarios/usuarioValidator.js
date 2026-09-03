const AppError = require("../../shared/errors/AppError");
const {
  exigirObjeto,
  validarCamposPermitidos,
  normalizarEmail,
  validarSenha,
  normalizarNome
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

function validarConsulta(query) {
  const permitidos = ["pagina", "limite", "busca", "papel", "ativo"];
  if (Object.keys(query).some(function invalido(chave) { return !permitidos.includes(chave); })) {
    throw new AppError("Filtros invalidos", 400, "FILTROS_INVALIDOS");
  }
  const pagina = query.pagina === undefined ? 1 : Number(query.pagina);
  const limite = query.limite === undefined ? 30 : Number(query.limite);
  const papeis = ["aluno", "professor", "admin"];
  if (!Number.isSafeInteger(pagina) || pagina < 1 || !Number.isSafeInteger(limite) || limite < 1 || limite > 100) {
    throw new AppError("Paginacao invalida", 400, "PAGINACAO_INVALIDA");
  }
  if (query.papel && !papeis.includes(query.papel)) throw new AppError("Tipo de usuario invalido", 400, "PAPEL_INVALIDO");
  if (query.ativo !== undefined && !["true", "false"].includes(query.ativo)) throw new AppError("Estado invalido", 400, "ESTADO_USUARIO_INVALIDO");
  return { pagina: pagina, limite: limite, busca: String(query.busca || "").trim().slice(0, 120), papel: query.papel || null, ativo: query.ativo === undefined ? null : query.ativo === "true" };
}

function validarCriacao(corpo) {
  exigirObjeto(corpo);
  validarCamposPermitidos(corpo, ["nome", "email", "senha", "papel"]);
  const papel = validarAlteracaoDePapel({ papel: corpo.papel }).papel;
  return { nome: normalizarNome(corpo.nome), email: normalizarEmail(corpo.email), senha: validarSenha(corpo.senha), papel: papel };
}

function validarEdicao(corpo) {
  exigirObjeto(corpo);
  validarCamposPermitidos(corpo, ["nome", "email"]);
  return { nome: normalizarNome(corpo.nome), email: normalizarEmail(corpo.email) };
}

module.exports = {
  validarUsuarioId: validarUsuarioId,
  validarAlteracaoDeAtivo: validarAlteracaoDeAtivo,
  validarAlteracaoDePapel: validarAlteracaoDePapel,
  validarConsulta: validarConsulta,
  validarCriacao: validarCriacao,
  validarEdicao: validarEdicao
};

