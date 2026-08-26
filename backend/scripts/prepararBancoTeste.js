const criarBanco = require("./criarBanco");
const executarMigrations = require("./executarMigrations");
const { obterConfiguracao } = require("../src/shared/config/ambiente");

function criarConfiguracaoDeTeste(configuracaoBase) {
  const nomeDoBanco = process.env.DB_TEST_NAME
    || configuracaoBase.banco.nome + "_test";

  if (!/^[a-zA-Z0-9_]+$/.test(nomeDoBanco)) {
    throw new Error("Nome do banco de teste invalido");
  }

  return {
    ambiente: "test",
    porta: configuracaoBase.porta,
    nivelDeLog: "silent",
    origensCors: configuracaoBase.origensCors,
    seguranca: configuracaoBase.seguranca,
    banco: Object.assign({}, configuracaoBase.banco, { nome: nomeDoBanco })
  };
}

async function prepararBancoTeste() {
  const configuracao = criarConfiguracaoDeTeste(obterConfiguracao());
  await criarBanco(configuracao);
  await executarMigrations(configuracao);
}

if (require.main === module) {
  prepararBancoTeste().catch(function tratarFalha(erro) {
    console.error("Falha ao preparar banco de teste: " + erro.message);
    process.exitCode = 1;
  });
}

module.exports = {
  criarConfiguracaoDeTeste: criarConfiguracaoDeTeste,
  prepararBancoTeste: prepararBancoTeste
};
