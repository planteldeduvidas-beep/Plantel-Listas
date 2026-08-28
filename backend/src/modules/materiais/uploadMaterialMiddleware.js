const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");
const multer = require("multer");
const AppError = require("../../shared/errors/AppError");

const DIRETORIO_TEMPORARIO = path.join(os.tmpdir(), "plantel-listas-uploads");
fs.mkdirSync(DIRETORIO_TEMPORARIO, { recursive: true });

function criarUploadMaterialMiddleware(configuracao) {
  const limite = Math.max(
    configuracao.seguranca.tamanhoMaximoPdfBytes,
    configuracao.seguranca.tamanhoMaximoVideoBytes
  );
  const receber = multer({
    dest: DIRETORIO_TEMPORARIO,
    limits: { fileSize: limite, files: 1, fields: 8, parts: 9 }
  }).single("arquivo");
  return function receberArquivo(req, res, next) {
    receber(req, res, function concluir(erro) {
      if (erro) {
        next(new AppError(
          erro.code === "LIMIT_FILE_SIZE" ? "O arquivo excede o tamanho permitido" : "Upload invalido",
          erro.code === "LIMIT_FILE_SIZE" ? 413 : 400,
          erro.code === "LIMIT_FILE_SIZE" ? "ARQUIVO_MUITO_GRANDE" : "UPLOAD_INVALIDO"
        ));
        return;
      }
      next();
    });
  };
}

module.exports = criarUploadMaterialMiddleware;
