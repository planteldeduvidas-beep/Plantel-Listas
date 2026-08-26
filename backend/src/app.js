const crypto = require("node:crypto");
const path = require("node:path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const pinoHttp = require("pino-http");
const cookieParser = require("cookie-parser");
const AppError = require("./shared/errors/AppError");
const tratarRotaNaoEncontrada = require("./shared/middlewares/tratarRotaNaoEncontrada");
const tratarErros = require("./shared/middlewares/tratarErros");
const criarRateLimiters = require("./shared/middlewares/criarRateLimiters");
const { criarEmailProviderNaoConfigurado } = require("./shared/providers/emailProvider");
const criarUsuarioRepository = require("./modules/usuarios/usuarioRepository");
const criarAutenticacaoRepository = require("./modules/autenticacao/autenticacaoRepository");
const { criarAutenticacaoService } = require("./modules/autenticacao/autenticacaoService");
const criarUsuarioService = require("./modules/usuarios/usuarioService");
const criarAutenticacaoController = require("./modules/autenticacao/autenticacaoController");
const criarUsuarioController = require("./modules/usuarios/usuarioController");
const criarAutenticacaoRoutes = require("./modules/autenticacao/autenticacaoRoutes");
const criarUsuarioRoutes = require("./modules/usuarios/usuarioRoutes");
const criarEstruturaAcervoRepository = require("./modules/categorias/estruturaAcervoRepository");
const criarEstruturaAcervoService = require("./modules/categorias/estruturaAcervoService");
const criarEstruturaAcervoController = require("./modules/categorias/estruturaAcervoController");
const criarEstruturaAcervoRoutes = require("./modules/categorias/estruturaAcervoRoutes");
const criarPermissaoRepository = require("./modules/permissoes/permissaoRepository");
const criarPermissaoService = require("./modules/permissoes/permissaoService");
const criarPermissaoController = require("./modules/permissoes/permissaoController");
const criarPermissaoRoutes = require("./modules/permissoes/permissaoRoutes");
const {
  criarAutenticacaoMiddleware,
  autorizarAdmin
} = require("./modules/autenticacao/autenticacaoMiddleware");

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

function registrarModulos(aplicacao, configuracao, logger, dependencias) {
  const pool = dependencias.pool;
  const emailProvider = dependencias.emailProvider
    || criarEmailProviderNaoConfigurado(logger);
  const usuarioRepository = criarUsuarioRepository(pool);
  const autenticacaoRepository = criarAutenticacaoRepository(pool);
  const serviceAutenticacao = criarAutenticacaoService({
    usuarioRepository: usuarioRepository,
    autenticacaoRepository: autenticacaoRepository,
    emailProvider: emailProvider,
    configuracao: configuracao
  });
  const serviceUsuario = criarUsuarioService({
    usuarioRepository: usuarioRepository,
    autenticacaoRepository: autenticacaoRepository,
    logger: logger
  });
  const autenticar = criarAutenticacaoMiddleware(
    autenticacaoRepository,
    configuracao
  );
  const rateLimiters = criarRateLimiters(configuracao);
  const estruturaRepository = criarEstruturaAcervoRepository(pool);
  const estruturaService = criarEstruturaAcervoService(estruturaRepository);
  const estruturaController = criarEstruturaAcervoController(estruturaService);
  const estruturaRoutes = criarEstruturaAcervoRoutes({
    controller: estruturaController,
    autenticar: autenticar,
    autorizarAdmin: autorizarAdmin
  });
  const permissaoRepository = criarPermissaoRepository(pool);
  const permissaoService = criarPermissaoService({
    repository: permissaoRepository,
    usuarioRepository: usuarioRepository,
    estruturaRepository: estruturaRepository
  });

  aplicacao.use("/api/autenticacao", criarAutenticacaoRoutes({
    controller: criarAutenticacaoController(serviceAutenticacao, configuracao),
    autenticar: autenticar,
    rateLimiters: rateLimiters
  }));
  aplicacao.use("/api/usuarios", criarUsuarioRoutes({
    controller: criarUsuarioController(serviceUsuario),
    autenticar: autenticar,
    autorizarAdmin: autorizarAdmin
  }));
  aplicacao.use("/api/estrutura-acervo", estruturaRoutes.publica);
  aplicacao.use("/api/categorias", estruturaRoutes.categorias);
  aplicacao.use("/api/disciplinas", estruturaRoutes.disciplinas);
  aplicacao.use("/api/concursos", estruturaRoutes.concursos);
  aplicacao.use("/api/permissoes", criarPermissaoRoutes({
    controller: criarPermissaoController(permissaoService),
    autenticar: autenticar,
    autorizarAdmin: autorizarAdmin
  }));
}

function criarAplicacao(configuracao, logger, dependenciasInformadas) {
  const aplicacao = express();
  const dependencias = dependenciasInformadas || {};

  aplicacao.disable("x-powered-by");
  aplicacao.set("trust proxy", configuracao.confiarProxy || false);
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
  aplicacao.use(cookieParser());

  aplicacao.get("/api/saude", function verificarSaude(req, res) {
    res.status(200).json({ status: "ok" });
  });

  if (dependencias.pool) {
    registrarModulos(aplicacao, configuracao, logger, dependencias);
  }

  if (configuracao.ambiente === "production") {
    const caminhoDoFrontend = path.resolve(__dirname, "../../frontend/dist");
    aplicacao.use(express.static(caminhoDoFrontend));
  }

  aplicacao.use(tratarRotaNaoEncontrada);
  aplicacao.use(tratarErros);

  return aplicacao;
}

module.exports = criarAplicacao;
