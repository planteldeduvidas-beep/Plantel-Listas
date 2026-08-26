class AppError extends Error {
  constructor(mensagem, statusCode, codigo) {
    super(mensagem);
    this.name = "AppError";
    this.statusCode = statusCode || 500;
    this.codigo = codigo || "ERRO_APLICACAO";
    this.operacional = true;
    Error.captureStackTrace(this, AppError);
  }
}

module.exports = AppError;

