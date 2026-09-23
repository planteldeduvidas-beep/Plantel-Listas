const test = require("node:test");
const assert = require("node:assert/strict");
const { validarDados, validarImagem } = require("../src/modules/parceiros/parceiroValidator");

const base = { nome: "Parceiro", descricao: "Curso", link: "https://example.com/curso" };

test("valida link HTTPS publico e rejeita mass assignment e HTML", () => {
  assert.equal(validarDados(base, false).link, "https://example.com/curso");
  for (const link of ["javascript:alert(1)", "http://example.com", "https://localhost/a", "https://127.0.0.1/a", "https://a.local/"]) {
    assert.throws(() => validarDados({ ...base, link }, false));
  }
  assert.throws(() => validarDados({ ...base, papel: "admin" }, false));
  assert.throws(() => validarDados({ ...base, nome: "<script>" }, false));
  assert.throws(() => validarDados({ ...base, descricao: "<img src=x>" }, false));
});

test("cupom, desconto e imagem sao opcionais", () => {
  const dados = validarDados(base, false);
  assert.equal(dados.cupom, null);
  assert.equal(dados.desconto, null);
  assert.equal(dados.ativo, false);
  assert.equal(dados.ordem, 0);
  assert.deepEqual(validarDados({ ativo: true }, true), { ativo: true });
});

test("imagem exige assinatura e MIME coerentes", () => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/FioAAAAASUVORK5CYII=", "base64");
  assert.equal(validarImagem({ buffer: png, size: png.length, mimetype: "image/png" }), "image/png");
  assert.throws(() => validarImagem({ buffer: png, size: png.length, mimetype: "image/jpeg" }));
  assert.throws(() => validarImagem({ buffer: Buffer.from("<svg>hack</svg>"), size: 15, mimetype: "image/svg+xml" }));
  assert.throws(() => validarImagem({ buffer: png, size: 512 * 1024 + 1, mimetype: "image/png" }));
});
