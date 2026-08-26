const test = require("node:test");
const assert = require("node:assert/strict");
const { verificarConexaoComBanco } = require("../src/shared/database/conexao");

test("transforma falha do banco em erro operacional controlado", async function testarFalhaDoBanco() {
  const pool = {
    execute: function falharConsulta() {
      return Promise.reject(new Error("ECONNREFUSED com detalhe interno"));
    }
  };

  await assert.rejects(
    verificarConexaoComBanco(pool),
    function validarErro(erro) {
      return erro.statusCode === 503
        && erro.codigo === "BANCO_INDISPONIVEL"
        && erro.message === "Banco de dados indisponivel";
    }
  );
});

