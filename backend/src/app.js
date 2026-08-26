const crypto = require("node:crypto");
const path = require("node:path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const pinoHttp = require("pino-http");
const AppError = require("./shared/errors/AppError");
const tratarRotaNaoEncontrada = require("./shared/middlewares/tratarRotaNaoEncontrada");
const tratarErros = require("./shared/middlewares/tratarErros");

function criarConfiguracaoCors(configuracao) {
  return {
    credentials: true,
    origin: function validarOrigem(origem, callback) {
      if (!origem || configuracao.origensCors.includes(origem)) {
        callback(null, true);
        return;
      }

      callback(new AppError("Origem nao permitida", 403, "ORIGEM_NAO_PERMITIDA"));
    }
  };
}

function criarAplicacao(configuracao, logger) {
  const aplicacao = express();

  aplicacao.disable("x-powered-by");
  aplicacao.locals.configuracao = configuracao;
  aplicacao.locals.logger = logger;
  aplicacao.use(pinoHttp({
    logger: logger,
    genReqId: function gerarIdDaRequisicao() {
      return crypto.randomUUID();
    }
  }));
  aplicacao.use(helmet());
  aplicacao.use(cors(criarConfiguracaoCors(configuracao)));
  aplicacao.use(express.json({ limit: "100kb" }));

  aplicacao.get("/api/saude", function verificarSaude(req, res) {
    res.status(200).json({ status: "ok" });
  });

  if (configuracao.ambiente === "production") {
    const caminhoDoFrontend = path.resolve(__dirname, "../../frontend/dist");
    aplicacao.use(express.static(caminhoDoFrontend));
  }

  aplicacao.use(tratarRotaNaoEncontrada);
  aplicacao.use(tratarErros);

  return aplicacao;
}

module.exports = criarAplicacao;
