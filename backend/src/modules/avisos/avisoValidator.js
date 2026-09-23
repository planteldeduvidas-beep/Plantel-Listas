const AppError = require("../../shared/errors/AppError");

function erro(mensagem) {
  return new AppError(mensagem, 400, "AVISO_INVALIDO");
}

function validarId(valor) {
  const id = Number(valor);
  if (!Number.isSafeInteger(id) || id < 1) throw erro("Aviso invalido");
  return id;
}

function validarDados(corpo, parcial = false) {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)
    || Object.keys(corpo).some(campo => !["texto", "ativo", "ordem"].includes(campo))
    || (parcial && !Object.keys(corpo).length)) throw erro("Dados do aviso invalidos");
  const dados = {};
  if (!parcial || Object.hasOwn(corpo, "texto")) {
    if (typeof corpo.texto !== "string") throw erro("Texto invalido");
    const texto = corpo.texto.trim().replace(/\s+/g, " ");
    if (!texto || texto.length > 160 || /[<>\u0000-\u001f\u007f]/.test(texto)) throw erro("Texto invalido");
    dados.texto = texto;
  }
  if (!parcial || Object.hasOwn(corpo, "ativo")) {
    if (corpo.ativo !== undefined && typeof corpo.ativo !== "boolean") throw erro("Estado invalido");
    dados.ativo = corpo.ativo === true;
  }
  if (!parcial || Object.hasOwn(corpo, "ordem")) {
    if (corpo.ordem !== undefined && (!Number.isInteger(corpo.ordem) || corpo.ordem < 0 || corpo.ordem > 100000)) {
      throw erro("Ordem invalida");
    }
    dados.ordem = corpo.ordem === undefined ? 0 : corpo.ordem;
  }
  return dados;
}

module.exports = { validarId, validarDados };
