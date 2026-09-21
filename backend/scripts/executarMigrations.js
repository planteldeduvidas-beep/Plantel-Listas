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

async function repararMigration006Parcial(conexao, nomeDoBanco) {
  const [registro] = await conexao.execute(
    "SELECT id FROM migrations WHERE nome = '006_consulta_acervo.sql' LIMIT 1"
  );
  if (registro.length > 0) {
    return;
  }

  const [colunas] = await conexao.execute(
    "SELECT COUNT(*) AS total FROM information_schema.columns "
      + "WHERE table_schema = ? AND table_name = 'categorias' "
      + "AND column_name = 'disciplina_id'",
    [nomeDoBanco]
  );
  if (Number(colunas[0].total) === 0) {
    return;
  }

  const [contagens] = await conexao.query(
    "SELECT "
      + "(SELECT COUNT(*) FROM categorias) AS categorias, "
      + "(SELECT COUNT(*) FROM materiais) AS materiais, "
      + "(SELECT COUNT(*) FROM disciplinas) AS disciplinas, "
      + "(SELECT COUNT(*) FROM concursos) AS concursos"
  );
  const possuiDados = Object.values(contagens[0]).some(function verificar(total) {
    return Number(total) > 0;
  });
  if (possuiDados) {
    throw new Error(
      "Migration 006 parcialmente aplicada em banco com dados; revisao manual obrigatoria"
    );
  }

  await conexao.query(
    "ALTER TABLE categorias "
      + "DROP FOREIGN KEY fk_categorias_disciplina, "
      + "DROP FOREIGN KEY fk_categorias_concurso, "
      + "DROP INDEX idx_categorias_disciplina_ativo, "
      + "DROP INDEX idx_categorias_concurso_ativo, "
      + "DROP COLUMN classificacao_origem, "
      + "DROP COLUMN concurso_id, "
      + "DROP COLUMN disciplina_id"
  );
  await conexao.query(
    "ALTER TABLE materiais "
      + "DROP INDEX ftx_materiais_nome, "
      + "DROP INDEX idx_materiais_disponivel_nome, "
      + "DROP INDEX idx_materiais_categoria_tipo_nome"
  );
  console.log("Estado parcial da migration 006 removido com seguranca");
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

    await repararMigration006Parcial(conexao, banco.nome);

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

