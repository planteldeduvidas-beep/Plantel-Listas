const test = require("node:test");
const assert = require("node:assert/strict");
const { definirCookieCsrf } = require("../src/shared/utils/cookies");

test("cookie CSRF tambem fica inacessivel a JavaScript", function testarCookieCsrf() {
  let opcoesRecebidas;
  const resposta = {
    cookie: function registrar(nome, valor, opcoes) {
      opcoesRecebidas = opcoes;
    }
  };
  definirCookieCsrf(resposta, "token", {
    ambiente: "production",
    seguranca: { nomeCookieCsrf: "plantel_csrf" }
  });

  assert.equal(opcoesRecebidas.httpOnly, true);
  assert.equal(opcoesRecebidas.secure, true);
  assert.equal(opcoesRecebidas.sameSite, "lax");
});
