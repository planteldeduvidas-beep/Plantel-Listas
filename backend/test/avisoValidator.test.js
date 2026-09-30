const test = require("node:test");
const assert = require("node:assert/strict");
const { validarDados } = require("../src/modules/avisos/avisoValidator");

test("aviso comporta os dados completos do parceiro sem liberar texto ilimitado", () => {
  assert.equal(validarDados({ texto: "a".repeat(600) }).texto.length, 600);
  assert.throws(() => validarDados({ texto: "a".repeat(601) }), /Texto invalido/);
  assert.throws(() => validarDados({ texto: "<script>" }), /Texto invalido/);
});

test("link opcional aceita somente endereco HTTPS sem credenciais", () => {
  assert.equal(validarDados({ texto: "Parceria", url: "https://parceiro.example.com/oferta" }).url, "https://parceiro.example.com/oferta");
  assert.equal(validarDados({ texto: "Sem link" }).url, null);
  assert.equal(validarDados({ url: "" }, true).url, null);
  for (const url of ["javascript:alert(1)", "http://parceiro.example.com", "https://usuario:senha@parceiro.example.com", "https://parceiro.example.com\nmalicioso"]) {
    assert.throws(() => validarDados({ texto: "Aviso", url }), /Link invalido/);
  }
});
