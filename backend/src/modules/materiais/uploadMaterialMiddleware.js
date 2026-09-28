const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const multer = require("multer");
const AppError = require("../../shared/errors/AppError");

const DIRETORIO_TEMPORARIO = path.join(os.tmpdir(), "plantel-listas-uploads");

function criarUploadMaterialMiddleware(configuracao) {
  const limite = Math.max(
    configuracao.seguranca.tamanhoMaximoPdfBytes,
    configuracao.seguranca.tamanhoMaximoVideoBytes
  );
  const receber = multer({
    storage: multer.diskStorage({
      destination(req, arquivo, concluir) {
        // O host pode limpar /tmp enquanto o processo continua ativo.
        fs.mkdir(DIRETORIO_TEMPORARIO, { recursive: true }, function preparado(erro) {
          concluir(erro, DIRETORIO_TEMPORARIO);
        });
      },
      filename(req, arquivo, concluir) { concluir(null, crypto.randomUUID()); }
    }),
    limits: { fileSize: limite, files: 1, fields: 8, parts: 9 }
  }).single("arquivo");
  return function receberArquivo(req, res, next) {
    receber(req, res, function concluir(erro) {
      if (erro) {
        const falhaArmazenamento = ["ENOENT","EACCES","EPERM","ENOSPC","EMFILE","ENFILE","EIO","EROFS"].includes(erro.code);
        const codigoSeguro = falhaArmazenamento
          ? erro.code : erro instanceof multer.MulterError ? erro.code : "MULTIPART_INVALIDO";
        if (req.log) req.log.warn({codigo:codigoSeguro},"Falha ao receber upload de material");
        if (falhaArmazenamento) {
          return next(new AppError("O servidor nao conseguiu receber o arquivo temporariamente. Tente novamente mais tarde.",503,"UPLOAD_ARMAZENAMENTO_INDISPONIVEL"));
        }
        next(new AppError(
          erro.code === "LIMIT_FILE_SIZE" ? "O arquivo excede o tamanho permitido" : "Nao foi possivel receber o arquivo. Selecione um unico PDF, MP4, M4V ou WebM e tente novamente.",
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
