const http = require("node:http");
const criarAplicacao = require("./app");
const { obterConfiguracao } = require("./shared/config/ambiente");
const criarLogger = require("./shared/config/logger");
const { criarPool, verificarConexaoComBanco } = require("./shared/database/conexao");
const { criarEmailProvider } = require("./shared/providers/emailProvider");

async function iniciarServidor() {
  let configuracao;
  let logger;

  try {
    configuracao = obterConfiguracao();
    logger = criarLogger(configuracao);
    const pool = criarPool(configuracao.banco);
    await verificarConexaoComBanco(pool);

    const emailProvider = criarEmailProvider(configuracao.email, logger);
    const aplicacao = criarAplicacao(configuracao, logger, {
      pool: pool,
      emailProvider: emailProvider
    });
    const servidor = http.createServer(aplicacao);

    servidor.listen(configuracao.porta, function informarInicio() {
      logger.info(
        { porta: configuracao.porta, ambiente: configuracao.ambiente },
        "Servidor iniciado"
      );
    });

    async function encerrarServidor(sinal) {
      logger.info({ sinal: sinal }, "Encerrando servidor");
      servidor.close(async function finalizarConexoes(erro) {
        await pool.end();

        if (erro) {
          logger.error({ err: erro }, "Falha ao encerrar servidor");
          process.exitCode = 1;
        }
      });
    }

    process.once("SIGINT", function encerrarComSigint() {
      encerrarServidor("SIGINT");
    });
    process.once("SIGTERM", function encerrarComSigterm() {
      encerrarServidor("SIGTERM");
    });
  } catch (erro) {
    if (logger) {
      logger.fatal({ err: erro }, "Nao foi possivel iniciar o servidor");
    } else {
      console.error("Nao foi possivel iniciar o servidor: " + erro.message);
    }

    process.exitCode = 1;
  }
}

iniciarServidor();

