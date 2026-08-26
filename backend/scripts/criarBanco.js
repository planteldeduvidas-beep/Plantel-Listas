const mysql = require("mysql2/promise");
const { obterConfiguracao } = require("../src/shared/config/ambiente");

async function criarBanco() {
  const configuracao = obterConfiguracao();
  const banco = configuracao.banco;
  const conexao = await mysql.createConnection({
    host: banco.host,
    port: banco.porta,
    user: banco.usuario,
    password: banco.senha
  });

  try {
    const nomeProtegido = "`" + banco.nome + "`";
    await conexao.query(
      "CREATE DATABASE IF NOT EXISTS " + nomeProtegido
      + " CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
    );
    console.log("Banco local preparado: " + banco.nome);
  } finally {
    await conexao.end();
  }
}

criarBanco().catch(function tratarFalha(erro) {
  console.error("Falha ao criar banco local: " + erro.message);
  process.exitCode = 1;
});

