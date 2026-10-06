const AppError = require('../../shared/errors/AppError');

function criarExigirFaixaEtaria(service) {
  return async function exigirFaixaEtaria(req, res, next) {
    try {
      if (req.usuario.papel === 'aluno') {
        const declaracao = await service.obter(req.usuario);
        if (!declaracao.faixaEtaria) {
          throw new AppError('Informe sua faixa etária para continuar na biblioteca.', 403, 'FAIXA_ETARIA_OBRIGATORIA');
        }
      }
      next();
    } catch (erro) {
      next(erro);
    }
  };
}

module.exports = criarExigirFaixaEtaria;
