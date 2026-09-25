const AppError = require("../errors/AppError");

async function tratarErros(erro, req, res, next) {
  // Erros conhecidos do parser nao sao falhas internas nem devem registrar body.
  if (erro.type === "entity.parse.failed" && erro.status === 400) {
    erro = new AppError("JSON invalido", 400, "JSON_INVALIDO");
  } else if (erro.type === "entity.too.large" && erro.status === 413) {
    erro = new AppError("Corpo da requisicao muito grande", 413, "CORPO_MUITO_GRANDE");
  }
  const configuracao = req.app.locals.configuracao;
  const logger = req.log || req.app.locals.logger;
  const erroOperacional = erro instanceof AppError && erro.operacional;
  const statusCode = erroOperacional ? erro.statusCode : 500;
  const codigo = erroOperacional ? erro.codigo : "ERRO_INTERNO";
  const mensagem = erroOperacional
    ? erro.message
    : "Ocorreu um erro interno inesperado";

  if (req.app.locals.defesaAtiva) await req.app.locals.defesaAtiva.registrarErro(req, codigo, statusCode);

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

