const test = require("node:test");
const assert = require("node:assert/strict");
const { validarVariaveisDeAmbiente } = require("../src/shared/config/ambiente");

function criarVariaveisValidas() {
  return {
    NODE_ENV: "test",
    PORT: "3000",
    LOG_LEVEL: "silent",
    CORS_ORIGENS: "http://localhost:5173",
    DB_HOST: "127.0.0.1",
    DB_PORT: "3306",
    DB_USER: "root",
    DB_PASSWORD: "",
    DB_NAME: "plantel_listas_test",
    DB_CONNECTION_LIMIT: "2"
  };
}

test("aceita uma configuracao valida", function testarConfiguracaoValida() {
  const configuracao = validarVariaveisDeAmbiente(criarVariaveisValidas());
  assert.equal(configuracao.ambiente, "test");
  assert.equal(configuracao.banco.nome, "plantel_listas_test");
});

test("falha de forma controlada quando uma env obrigatoria esta ausente", function testarEnvAusente() {
  const variaveis = criarVariaveisValidas();
  delete variaveis.DB_HOST;

  assert.throws(function validar() {
    validarVariaveisDeAmbiente(variaveis);
  }, /DB_HOST/);
});

test("recusa CORS irrestrito", function testarCorsIrrestrito() {
  const variaveis = criarVariaveisValidas();
  variaveis.CORS_ORIGENS = "*";

  assert.throws(function validar() {
    validarVariaveisDeAmbiente(variaveis);
  }, /nao pode liberar/);
});

