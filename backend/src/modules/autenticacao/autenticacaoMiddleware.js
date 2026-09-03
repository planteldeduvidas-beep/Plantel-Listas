const AppError = require("../../shared/errors/AppError");
const { gerarHashDoToken } = require("../../shared/utils/tokens");
const { limparCookieDeSessao } = require("../../shared/utils/cookies");

function criarAutenticacaoMiddleware(autenticacaoRepository, configuracao) {
  return async function autenticar(req, res, next) {
    try {
      const token = req.cookies[configuracao.seguranca.nomeCookieSessao];

      if (!token || typeof token !== "string" || token.length > 256) {
        limparCookieDeSessao(res, configuracao);
        next(new AppError("Autenticacao necessaria", 401, "NAO_AUTENTICADO"));
        return;
      }

      const tokenHash = gerarHashDoToken(token);
      const sessao = await autenticacaoRepository.buscarSessaoAtivaPorHash(tokenHash);

      if (!sessao) {
        limparCookieDeSessao(res, configuracao);
        next(new AppError("Autenticacao necessaria", 401, "NAO_AUTENTICADO"));
        return;
      }

      req.usuario = sessao.usuario;
      req.sessao = {
        id: sessao.sessaoId,
        tokenHash: sessao.tokenHash,
        expiraEm: sessao.expiraEm
      };
      next();
    } catch (erro) {
      next(erro);
    }
  };
}

function autorizarAdmin(req, res, next) {
  if (!req.usuario || req.usuario.papel !== "admin") {
    next(new AppError("Usuario sem permissao", 403, "SEM_PERMISSAO"));
    return;
  }

  next();
}

function autorizarAluno(req, res, next) {
  if (!req.usuario || req.usuario.papel !== "aluno") {
    next(new AppError("Usuario sem permissao", 403, "SEM_PERMISSAO"));
    return;
  }
  next();
}

function autorizarAlunoOuProfessor(req, res, next) {
  if (!req.usuario || !["aluno", "professor"].includes(req.usuario.papel)) {
    next(new AppError("Usuario sem permissao", 403, "SEM_PERMISSAO"));
    return;
  }
  next();
}

module.exports = {
  criarAutenticacaoMiddleware: criarAutenticacaoMiddleware,
  autorizarAdmin: autorizarAdmin,
  autorizarAluno: autorizarAluno,
  autorizarAlunoOuProfessor: autorizarAlunoOuProfessor
};

