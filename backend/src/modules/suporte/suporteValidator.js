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

module.exports.validarAjudaConta = function (corpo) {
  exigirObjeto(corpo);
  validarCamposPermitidos(corpo, ["nome", "emailConta", "emailResposta", "mensagem"]);
  const { normalizarNome, normalizarEmail } = require("../autenticacao/autenticacaoValidator");
  const emailResposta = normalizarEmail(corpo.emailResposta);
  if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(emailResposta)) {
    throw new AppError("Informe um e-mail valido para receber a resposta", 400, "EMAIL_INVALIDO");
  }
  const emailConta = validarTexto(corpo.emailConta, "E-mail ou identificacao da conta", 2, 254);
  if (/[\r\n]/.test(emailConta)) throw new AppError("Identificacao da conta invalida", 400, "DADOS_SUPORTE_INVALIDOS");
  return { nome: normalizarNome(corpo.nome), emailConta, emailResposta,
    mensagem: validarTexto(corpo.mensagem, "Mensagem", 10, 3500) };
};
