const AppError = require("../errors/AppError");

function tratarErros(erro, req, res, next) {
  const configuracao = req.app.locals.configuracao;
  const logger = req.log || req.app.locals.logger;
  const erroOperacional = erro instanceof AppError && erro.operacional;
  const statusCode = erroOperacional ? erro.statusCode : 500;
  const codigo = erroOperacional ? erro.codigo : "ERRO_INTERNO";
  const mensagem = erroOperacional
    ? erro.message
    : "Ocorreu um erro interno inesperado";

  if (statusCode >= 500 && logger) {
    logger.error({ err: erro, codigo: codigo }, "Falha ao processar requisicao");
  }

  const resposta = {
    erro: {
      codigo: codigo,
      mensagem: mensagem
    }
  };

  if (configuracao.ambiente !== "production" && statusCode === 500) {
    resposta.erro.stack = erro.stack;
  }

  res.status(statusCode).json(resposta);
}

module.exports = tratarErros;

