const http = require("node:http");
const criarAplicacao = require("./app");
const { obterConfiguracao } = require("./shared/config/ambiente");
const criarLogger = require("./shared/config/logger");
const { criarPool, verificarConexaoComBanco } = require("./shared/database/conexao");
const { criarEmailProvider } = require("./shared/providers/emailProvider");

async function iniciarServidor() {
  let configuracao;
  let logger;
  let pool;

  try {
    configuracao = obterConfiguracao();
    logger = criarLogger(configuracao);
    pool = criarPool(configuracao.banco);
    await verificarConexaoComBanco(pool);

    const emailProvider = criarEmailProvider(configuracao.email, logger);
    const aplicacao = criarAplicacao(configuracao, logger, {
      pool: pool,
      emailProvider: emailProvider
    });
    await aplicacao.locals.integracaoGoogleDriveService
      .recuperarSincronizacoesInterrompidas();
    aplicacao.locals.googleDriveChangesService.iniciarMonitor();
    const servidor = http.createServer(aplicacao);

    servidor.listen(configuracao.porta, function informarInicio() {
      logger.info(
        { porta: configuracao.porta, ambiente: configuracao.ambiente },
        "Servidor iniciado"
      );
    });

    let encerramentoEmAndamento = null;
    async function encerrarServidor(motivo, erroFatal) {
      if (encerramentoEmAndamento) {
        return encerramentoEmAndamento;
      }

      encerramentoEmAndamento = (async function encerrar() {
        if (erroFatal) {
          logger.fatal({ err: erroFatal, motivo: motivo }, "Falha fatal no processo");
          process.exitCode = 1;
        } else {
          logger.info({ motivo: motivo }, "Encerrando servidor");
        }

        aplicacao.locals.googleDriveChangesService.pararMonitor();
        try {
          await new Promise(function aguardarServidor(resolve, reject) {
            servidor.close(function finalizar(erro) {
              if (erro) {
                reject(erro);
                return;
              }
              resolve();
            });
          });
        } finally {
          await pool.end();
        }
      })().catch(function registrarFalha(erro) {
        logger.error({ err: erro, motivo: motivo }, "Falha ao encerrar servidor");
        process.exitCode = 1;
      });

      return encerramentoEmAndamento;
    }

    process.once("SIGINT", function encerrarComSigint() {
      void encerrarServidor("SIGINT");
    });
    process.once("SIGTERM", function encerrarComSigterm() {
      void encerrarServidor("SIGTERM");
    });
    process.once("unhandledRejection", function encerrarComRejeicao(erro) {
      const erroNormalizado = erro instanceof Error ? erro : new Error(String(erro));
      void encerrarServidor("unhandledRejection", erroNormalizado);
    });
    process.once("uncaughtException", function encerrarComExcecao(erro) {
      void encerrarServidor("uncaughtException", erro);
    });
  } catch (erro) {
    if (logger) {
      logger.fatal({ err: erro }, "Nao foi possivel iniciar o servidor");
    } else {
      console.error("Nao foi possivel iniciar o servidor: " + erro.message);
    }

    process.exitCode = 1;
    if (pool) {
      await pool.end().catch(function ignorarFalhaAoFecharPool() {});
    }
  }
}

iniciarServidor();

