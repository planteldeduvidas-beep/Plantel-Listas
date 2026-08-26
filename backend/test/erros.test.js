const test = require("node:test");
const assert = require("node:assert/strict");
const tratarErros = require("../src/shared/middlewares/tratarErros");

function criarResposta() {
  return {
    statusRecebido: null,
    corpoRecebido: null,
    status: function definirStatus(statusCode) {
      this.statusRecebido = statusCode;
      return this;
    },
    json: function enviarJson(corpo) {
      this.corpoRecebido = corpo;
      return this;
    }
  };
}

test("nao expoe stack trace de erro inesperado em producao", function testarErroEmProducao() {
  const req = {
    app: {
      locals: {
        configuracao: { ambiente: "production" },
        logger: { error: function ignorarLog() {} }
      }
    }
  };
  const res = criarResposta();
  tratarErros(new Error("detalhe sensivel"), req, res, function next() {});

  assert.equal(res.statusRecebido, 500);
  assert.equal(res.corpoRecebido.erro.codigo, "ERRO_INTERNO");
  assert.equal(res.corpoRecebido.erro.mensagem, "Ocorreu um erro interno inesperado");
  assert.equal(res.corpoRecebido.erro.stack, undefined);
  assert.equal(JSON.stringify(res.corpoRecebido).includes("detalhe sensivel"), false);
});

