const AppError = require("../../shared/errors/AppError");

function validarCamposPermitidos(corpo, camposPermitidos) {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
    throw new AppError("Corpo da requisicao invalido", 400, "DADOS_INVALIDOS");
  }

  const camposRecebidos = Object.keys(corpo);
  const campoInvalido = camposRecebidos.find(function encontrarCampo(campo) {
    return !camposPermitidos.includes(campo);
  });

  if (campoInvalido) {
    throw new AppError("Campo nao permitido: " + campoInvalido, 400, "CAMPO_NAO_PERMITIDO");
  }
}

function validarId(valor, nome) {
  const id = Number(valor);

  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new AppError(nome + " invalido", 400, "ID_INVALIDO");
  }

  return id;
}

function validarNome(valor) {
  if (typeof valor !== "string") {
    throw new AppError("Nome obrigatorio", 400, "DADOS_INVALIDOS");
  }

  const nome = valor.trim();

  if (nome.length < 2 || nome.length > 120) {
    throw new AppError("Nome deve ter entre 2 e 120 caracteres", 400, "DADOS_INVALIDOS");
  }

  return nome;
}

function validarDescricao(valor) {
  if (valor === undefined || valor === null || valor === "") {
    return null;
  }

  if (typeof valor !== "string" || valor.trim().length > 500) {
    throw new AppError("Descricao invalida", 400, "DADOS_INVALIDOS");
  }

  return valor.trim() || null;
}

function validarCategoriaPaiId(valor) {
  if (valor === undefined || valor === null || valor === "") {
    return null;
  }

  return validarId(valor, "Categoria pai");
}

function validarOrdem(valor) {
  if (valor === undefined) {
    return 0;
  }

  if (!Number.isInteger(valor) || valor < 0 || valor > 100000) {
    throw new AppError("Ordem invalida", 400, "DADOS_INVALIDOS");
  }

  return valor;
}

function validarCategoria(corpo, parcial) {
  const campos = ["nome", "descricao", "categoriaPaiId", "ordem"];
  validarCamposPermitidos(corpo, campos);

  if (parcial && Object.keys(corpo).length === 0) {
    throw new AppError("Informe ao menos um campo", 400, "DADOS_INVALIDOS");
  }

  const dados = {};

  if (!parcial || Object.hasOwn(corpo, "nome")) {
    dados.nome = validarNome(corpo.nome);
  }

  if (!parcial || Object.hasOwn(corpo, "descricao")) {
    dados.descricao = validarDescricao(corpo.descricao);
  }

  if (!parcial || Object.hasOwn(corpo, "categoriaPaiId")) {
    dados.categoriaPaiId = validarCategoriaPaiId(corpo.categoriaPaiId);
  }

  if (!parcial || Object.hasOwn(corpo, "ordem")) {
    dados.ordem = validarOrdem(corpo.ordem);
  }

  return dados;
}

function validarClassificacao(corpo, parcial) {
  validarCamposPermitidos(corpo, ["nome", "descricao"]);

  if (parcial && Object.keys(corpo).length === 0) {
    throw new AppError("Informe ao menos um campo", 400, "DADOS_INVALIDOS");
  }

  const dados = {};

  if (!parcial || Object.hasOwn(corpo, "nome")) {
    dados.nome = validarNome(corpo.nome);
  }

  if (!parcial || Object.hasOwn(corpo, "descricao")) {
    dados.descricao = validarDescricao(corpo.descricao);
  }

  return dados;
}

function validarAtivo(corpo) {
  validarCamposPermitidos(corpo, ["ativo"]);

  if (typeof corpo.ativo !== "boolean" || Object.keys(corpo).length !== 1) {
    throw new AppError("Estado ativo invalido", 400, "DADOS_INVALIDOS");
  }

  return corpo.ativo;
}

module.exports = {
  validarId: validarId,
  validarCategoria: validarCategoria,
  validarClassificacao: validarClassificacao,
  validarAtivo: validarAtivo,
  validarCamposPermitidos: validarCamposPermitidos
};
