const fs = require("node:fs/promises");
const path = require("node:path");
const mysql = require("mysql2/promise");
const { obterConfiguracao } = require("../src/shared/config/ambiente");

const DIRETORIO_MIGRATIONS = path.resolve(__dirname, "../migrations");

async function listarMigrations() {
  const arquivos = await fs.readdir(DIRETORIO_MIGRATIONS);
  return arquivos.filter(function filtrarSql(arquivo) {
    return /^\d{3}_[a-z0-9_]+\.sql$/.test(arquivo);
  }).sort();
}

async function executarMigrations(configuracaoInformada) {
  const configuracao = configuracaoInformada || obterConfiguracao();
  const banco = configuracao.banco;
  const conexao = await mysql.createConnection({
    host: banco.host,
    port: banco.porta,
    user: banco.usuario,
    password: banco.senha,
    database: banco.nome,
    charset: "utf8mb4",
    multipleStatements: true
  });

  try {
    await conexao.execute(
      "CREATE TABLE IF NOT EXISTS migrations ("
      + "id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,"
      + "nome VARCHAR(255) NOT NULL,"
      + "executada_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,"
      + "PRIMARY KEY (id),"
      + "UNIQUE KEY uq_migrations_nome (nome)"
      + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    const migrations = await listarMigrations();

    for (const nomeDaMigration of migrations) {
      const [registros] = await conexao.execute(
        "SELECT id FROM migrations WHERE nome = ? LIMIT 1",
        [nomeDaMigration]
      );

      if (registros.length > 0) {
        console.log("Migration ja executada: " + nomeDaMigration);
        continue;
      }

      const caminho = path.join(DIRETORIO_MIGRATIONS, nomeDaMigration);
      const comandoSql = await fs.readFile(caminho, "utf8");

      await conexao.beginTransaction();
      try {
        await conexao.query(comandoSql);
        await conexao.execute(
          "INSERT INTO migrations (nome) VALUES (?)",
          [nomeDaMigration]
        );
        await conexao.commit();
        console.log("Migration executada: " + nomeDaMigration);
      } catch (erro) {
        await conexao.rollback();
        throw erro;
      }
    }
  } finally {
    await conexao.end();
  }
}

if (require.main === module) {
  executarMigrations().catch(function tratarFalha(erro) {
    console.error("Falha ao executar migrations: " + erro.message);
    process.exitCode = 1;
  });
}

module.exports = executarMigrations;

