const AppError = require("../../shared/errors/AppError");
const { validarMensagemDeSuporte } = require("./suporteValidator");

function criarSuporteService(dependencias) {
  const emailProvider = dependencias.emailProvider;
  const configuracao = dependencias.configuracao;
  const logger = dependencias.logger;

  async function enviar(usuario, corpo) {
    const dados = validarMensagemDeSuporte(corpo);
    if (!configuracao.suporte.destinatario) {
      throw new AppError("O suporte ainda nao esta configurado", 503, "SUPORTE_NAO_CONFIGURADO");
    }
    try {
      await emailProvider.enviarSuporte({
        destinatario: configuracao.suporte.destinatario,
        nome: usuario.nome,
        email: usuario.email,
        papel: usuario.papel,
        assunto: dados.assunto,
        mensagem: dados.mensagem
      });
    } catch (erro) {
      if (logger) {
        logger.error(
          { codigo: "FALHA_ENVIO_SUPORTE", usuarioId: usuario.id },
          "Falha operacional ao enviar mensagem de suporte"
        );
      }
      throw new AppError("Nao foi possivel enviar sua mensagem agora", 503, "SUPORTE_INDISPONIVEL");
    }
    return { mensagem: "Mensagem enviada. A equipe do Plantel respondera pelo seu e-mail." };
  }

  return { enviar: enviar };
}

module.exports = criarSuporteService;
