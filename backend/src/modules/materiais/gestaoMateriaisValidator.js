const path = require("node:path");
const fs = require("node:fs/promises");
const AppError = require("../../shared/errors/AppError");

function inteiroPositivo(valor, nome) {
  if (!/^\d+$/.test(String(valor || "")) || Number(valor) < 1) {
    throw new AppError(nome + " invalido", 400, "DADOS_INVALIDOS");
  }
  return Number(valor);
}

function nomeSeguro(valor, nomePadrao) {
  const nome = String(valor || nomePadrao || "").trim();
  if (!nome || nome.length > 240 || /[\x00-\x1f\\/:*?"<>|]/.test(nome) || nome === "." || nome === "..") {
    throw new AppError("Nome de material invalido", 400, "NOME_MATERIAL_INVALIDO");
  }
  return nome;
}

function validarCampos(corpo, permitidos) {
  Object.keys(corpo || {}).forEach(function verificar(campo) {
    if (!permitidos.includes(campo)) {
      throw new AppError("Campo nao permitido", 400, "MASS_ASSIGNMENT_RECUSADO");
    }
  });
}

async function identificarArquivo(arquivo, configuracao) {
  if (!arquivo || !arquivo.path || !arquivo.size) {
    throw new AppError("Selecione um arquivo", 400, "ARQUIVO_INVALIDO");
  }
  const descritor = await fs.open(arquivo.path, "r");
  const assinatura = Buffer.alloc(16);
  try {
    await descritor.read(assinatura, 0, assinatura.length, 0);
  } finally {
    await descritor.close();
  }
  const extensao = path.extname(arquivo.originalname || "").toLowerCase().slice(1);
  let tipo = null;
  let mimeType = null;
  if (assinatura.subarray(0, 5).toString("ascii") === "%PDF-" && extensao === "pdf") {
    tipo = "pdf";
    mimeType = "application/pdf";
  } else if (assinatura.subarray(4, 8).toString("ascii") === "ftyp" && ["mp4", "m4v"].includes(extensao)) {
    tipo = "video";
    mimeType = "video/mp4";
  } else if (assinatura.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) && extensao === "webm") {
    tipo = "video";
    mimeType = "video/webm";
  }
  if (!tipo || (arquivo.mimetype && arquivo.mimetype !== mimeType)) {
    throw new AppError("O arquivo nao corresponde a um PDF ou video permitido", 400, "TIPO_ARQUIVO_INVALIDO");
  }
  const limite = tipo === "pdf"
    ? configuracao.seguranca.tamanhoMaximoPdfBytes
    : configuracao.seguranca.tamanhoMaximoVideoBytes;
  if (arquivo.size > limite) {
    throw new AppError("O arquivo excede o tamanho permitido", 413, "ARQUIVO_MUITO_GRANDE");
  }
  return { tipo: tipo, mimeType: mimeType, extensao: extensao };
}

async function validarUpload(corpo, arquivo, configuracao) {
  validarCampos(corpo, ["categoriaId", "nome", "disciplinaId", "concursoId"]);
  const detectado = await identificarArquivo(arquivo, configuracao);
  const nome = nomeSeguro(corpo.nome, arquivo.originalname);
  if (path.extname(nome).toLowerCase().slice(1) !== detectado.extensao) {
    throw new AppError("O nome precisa manter a extensao do arquivo", 400, "EXTENSAO_INCOMPATIVEL");
  }
  return {
    categoriaId: inteiroPositivo(corpo.categoriaId, "Pasta"),
    nome: nome,
    disciplinaId: corpo.disciplinaId ? inteiroPositivo(corpo.disciplinaId, "Disciplina") : null,
    concursoId: corpo.concursoId ? inteiroPositivo(corpo.concursoId, "Concurso") : null,
    tipo: detectado.tipo,
    mimeType: detectado.mimeType,
    extensao: detectado.extensao
  };
}

function validarEdicao(corpo) {
  validarCampos(corpo, ["nome", "disciplinaId", "concursoId", "versao"]);
  if (!corpo || (!Object.prototype.hasOwnProperty.call(corpo, "nome")
      && !Object.prototype.hasOwnProperty.call(corpo, "disciplinaId")
      && !Object.prototype.hasOwnProperty.call(corpo, "concursoId"))) {
    throw new AppError("Nenhuma alteracao informada", 400, "DADOS_INVALIDOS");
  }
  return {
    nome: Object.prototype.hasOwnProperty.call(corpo, "nome") ? nomeSeguro(corpo.nome) : undefined,
    disciplinaId: Object.prototype.hasOwnProperty.call(corpo, "disciplinaId")
      ? (corpo.disciplinaId === null ? null : inteiroPositivo(corpo.disciplinaId, "Disciplina")) : undefined,
    concursoId: Object.prototype.hasOwnProperty.call(corpo, "concursoId")
      ? (corpo.concursoId === null ? null : inteiroPositivo(corpo.concursoId, "Concurso")) : undefined,
    versao: inteiroPositivo(corpo.versao, "Versao")
  };
}

function validarMovimentacao(corpo) {
  validarCampos(corpo, ["categoriaId", "versao"]);
  return { categoriaId: inteiroPositivo(corpo.categoriaId, "Pasta"), versao: inteiroPositivo(corpo.versao, "Versao") };
}

function validarVersao(corpo) {
  validarCampos(corpo, ["versao"]);
  return inteiroPositivo(corpo && corpo.versao, "Versao");
}

module.exports = {
  inteiroPositivo: inteiroPositivo,
  validarUpload: validarUpload,
  validarEdicao: validarEdicao,
  validarMovimentacao: validarMovimentacao,
  validarVersao: validarVersao,
  identificarArquivo: identificarArquivo
};
