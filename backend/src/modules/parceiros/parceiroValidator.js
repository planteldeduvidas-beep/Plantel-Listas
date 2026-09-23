const net = require("node:net");
const AppError = require("../../shared/errors/AppError");

const CAMPOS = ["nome", "descricao", "link", "cupom", "desconto", "textoBotao", "ativo", "ordem"];

function erro(mensagem) {
  return new AppError(mensagem, 400, "PARCEIRO_INVALIDO");
}

function validarId(valor) {
  const id = Number(valor);
  if (!Number.isSafeInteger(id) || id < 1) throw erro("Parceiro invalido");
  return id;
}

function texto(valor, campo, maximo, obrigatorio) {
  if (valor === null && !obrigatorio) return null;
  if (typeof valor !== "string") throw erro(campo + " invalido");
  const limpo = valor.trim().replace(/\s+/g, " ");
  if (limpo.length > maximo || (obrigatorio && !limpo) || /[<>\u0000-\u001f\u007f]/.test(limpo)) {
    throw erro(campo + " invalido");
  }
  return limpo || null;
}

function validarLink(valor) {
  if (typeof valor !== "string" || valor.length > 2048 || /[\\\u0000-\u001f\u007f]/.test(valor)) {
    throw erro("Link externo invalido");
  }
  let url;
  try { url = new URL(valor); } catch { throw erro("Link externo invalido"); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || !host.includes(".")
    || net.isIP(host) || /(^|\.)(localhost|local|internal|test)$/.test(host)) {
    throw erro("Use um link HTTPS publico para o parceiro");
  }
  return url.toString();
}

function validarDados(corpo, parcial) {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)
    || Object.keys(corpo).some(campo => !CAMPOS.includes(campo))
    || (parcial && !Object.keys(corpo).length)) throw erro("Dados do parceiro invalidos");
  const dados = {};
  if (!parcial || Object.hasOwn(corpo, "nome")) dados.nome = texto(corpo.nome, "Nome", 120, true);
  if (!parcial || Object.hasOwn(corpo, "descricao")) dados.descricao = texto(corpo.descricao, "Descricao", 240, true);
  if (!parcial || Object.hasOwn(corpo, "link")) dados.link = validarLink(corpo.link);
  for (const [campo, limite] of [["cupom", 80], ["desconto", 120], ["textoBotao", 60]]) {
    if (!parcial || Object.hasOwn(corpo, campo)) dados[campo] = corpo[campo] === undefined
      ? null : texto(corpo[campo], campo, limite, false);
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

function validarImagem(arquivo) {
  if (!arquivo || !Buffer.isBuffer(arquivo.buffer) || arquivo.size < 12 || arquivo.size > 512 * 1024) {
    throw erro("Imagem invalida ou maior que 512 KB");
  }
  const bytes = arquivo.buffer;
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;
  const webp = bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  const mime = png ? "image/png" : jpeg ? "image/jpeg" : webp ? "image/webp" : null;
  if (!mime || arquivo.mimetype !== mime) throw erro("Use uma imagem PNG, JPEG ou WebP valida");
  return mime;
}

module.exports = { validarId, validarDados, validarImagem };
