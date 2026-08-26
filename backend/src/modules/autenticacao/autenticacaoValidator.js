const AppError = require("../../shared/errors/AppError");

function exigirObjeto(corpo) {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
    throw new AppError("Corpo da requisicao invalido", 400, "DADOS_INVALIDOS");
  }
}

function validarCamposPermitidos(corpo, camposPermitidos) {
  const camposRecebidos = Object.keys(corpo);
  const campoNaoPermitido = camposRecebidos.find(function localizarCampo(campo) {
    return !camposPermitidos.includes(campo);
  });

  if (campoNaoPermitido) {
    throw new AppError(
      "A requisicao contem campos nao permitidos",
      400,
      "CAMPOS_NAO_PERMITIDOS"
    );
  }
}

function normalizarEmail(email) {
  if (typeof email !== "string") {
    throw new AppError("Email invalido", 400, "EMAIL_INVALIDO");
  }

  const emailNormalizado = email.trim().toLowerCase();
  const formatoValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalizado);

  if (!formatoValido || emailNormalizado.length > 254) {
    throw new AppError("Email invalido", 400, "EMAIL_INVALIDO");
  }

  return emailNormalizado;
}

function validarSenha(senha) {
  if (typeof senha !== "string" || senha.length < 12 || senha.length > 128) {
    throw new AppError(
      "A senha deve ter entre 12 e 128 caracteres",
      400,
      "SENHA_INVALIDA"
    );
  }

  return senha;
}

function validarCredenciais(corpo) {
  exigirObjeto(corpo);
  validarCamposPermitidos(corpo, ["email", "senha"]);
  return {
    email: normalizarEmail(corpo.email),
    senha: validarSenha(corpo.senha)
  };
}

function validarSolicitacaoDeRecuperacao(corpo) {
  exigirObjeto(corpo);
  validarCamposPermitidos(corpo, ["email"]);
  return { email: normalizarEmail(corpo.email) };
}

function validarRedefinicaoDeSenha(corpo) {
  exigirObjeto(corpo);
  validarCamposPermitidos(corpo, ["token", "novaSenha"]);

  if (typeof corpo.token !== "string" || corpo.token.length < 32 || corpo.token.length > 256) {
    throw new AppError("Token de recuperacao invalido", 400, "TOKEN_RECUPERACAO_INVALIDO");
  }

  return {
    token: corpo.token,
    novaSenha: validarSenha(corpo.novaSenha)
  };
}

module.exports = {
  normalizarEmail: normalizarEmail,
  validarSenha: validarSenha,
  validarCredenciais: validarCredenciais,
  validarSolicitacaoDeRecuperacao: validarSolicitacaoDeRecuperacao,
  validarRedefinicaoDeSenha: validarRedefinicaoDeSenha,
  validarCamposPermitidos: validarCamposPermitidos,
  exigirObjeto: exigirObjeto
};

