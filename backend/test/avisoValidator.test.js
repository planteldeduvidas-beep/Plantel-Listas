const test = require("node:test");
const assert = require("node:assert/strict");
const { validarDados } = require("../src/modules/avisos/avisoValidator");

test("link opcional aceita somente endereco HTTPS sem credenciais", () => {
  assert.equal(validarDados({ texto: "Parceria", url: "https://parceiro.example.com/oferta" }).url, "https://parceiro.example.com/oferta");
  assert.equal(validarDados({ texto: "Sem link" }).url, null);
  assert.equal(validarDados({ url: "" }, true).url, null);
  for (const url of ["javascript:alert(1)", "http://parceiro.example.com", "https://usuario:senha@parceiro.example.com", "https://parceiro.example.com\nmalicioso"]) {
    assert.throws(() => validarDados({ texto: "Aviso", url }), /Link invalido/);
  }
});
