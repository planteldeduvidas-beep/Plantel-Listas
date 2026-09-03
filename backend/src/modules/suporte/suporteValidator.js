const AppError = require("../../shared/errors/AppError");
const {
  exigirObjeto,
  validarCamposPermitidos
} = require("../autenticacao/autenticacaoValidator");

function validarTexto(valor, nome, minimo, maximo) {
  if (typeof valor !== "string") {
    throw new AppError(nome + " invalido", 400, "DADOS_SUPORTE_INVALIDOS");
  }
  const texto = valor.trim();
  if (texto.length < minimo || texto.length > maximo || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(texto)) {
    throw new AppError(nome + " invalido", 400, "DADOS_SUPORTE_INVALIDOS");
  }
  return texto;
}

function validarMensagemDeSuporte(corpo) {
  exigirObjeto(corpo);
  validarCamposPermitidos(corpo, ["assunto", "mensagem"]);
  const assunto = validarTexto(corpo.assunto, "Assunto", 3, 120);
  if (/\r|\n/.test(assunto)) {
    throw new AppError("Assunto invalido", 400, "DADOS_SUPORTE_INVALIDOS");
  }
  return {
    assunto: assunto,
    mensagem: validarTexto(corpo.mensagem, "Mensagem", 10, 4000)
  };
}

module.exports = { validarMensagemDeSuporte: validarMensagemDeSuporte };
