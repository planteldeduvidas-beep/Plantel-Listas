const mysql = require("mysql2/promise");
const AppError = require("../errors/AppError");

function criarPool(configuracaoDoBanco) {
  return mysql.createPool({
    host: configuracaoDoBanco.host,
    port: configuracaoDoBanco.porta,
    user: configuracaoDoBanco.usuario,
    password: configuracaoDoBanco.senha,
    database: configuracaoDoBanco.nome,
    charset: "utf8mb4",
    connectionLimit: configuracaoDoBanco.limiteDeConexoes,
    connectTimeout: configuracaoDoBanco.timeoutConexaoMs,
    waitForConnections: true,
    queueLimit: configuracaoDoBanco.limiteDaFila,
    enableKeepAlive: true,
    multipleStatements: false
  });
}

async function verificarConexaoComBanco(pool) {
  try {
    await pool.execute("SELECT 1");
  } catch (erro) {
    throw new AppError(
      "Banco de dados indisponivel",
      503,
      "BANCO_INDISPONIVEL"
    );
  }
}

module.exports = {
  criarPool: criarPool,
  verificarConexaoComBanco: verificarConexaoComBanco
};

