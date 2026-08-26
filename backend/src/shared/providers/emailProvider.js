const nodemailer = require("nodemailer");

function criarEmailProviderNaoConfigurado(logger) {
  return {
    enviarRecuperacaoSenha: async function informarPendencia() {
      if (logger) {
        logger.warn(
          { codigo: "EMAIL_PROVIDER_NAO_CONFIGURADO" },
          "Envio de recuperacao indisponivel neste ambiente"
        );
      }

      throw new Error("EMAIL_PROVIDER_NAO_CONFIGURADO");
    }
  };
}

function configuracaoSmtpCompleta(configuracao) {
  return Boolean(
    configuracao
    && configuracao.host
    && configuracao.usuario
    && configuracao.senha
    && configuracao.remetente
  );
}

function criarEmailProviderSmtp(configuracao) {
  const transportador = nodemailer.createTransport({
    host: configuracao.host,
    port: configuracao.porta,
    secure: configuracao.seguro,
    auth: {
      user: configuracao.usuario,
      pass: configuracao.senha
    },
    disableFileAccess: true,
    disableUrlAccess: true
  });

  return {
    enviarRecuperacaoSenha: async function enviarRecuperacao(dados) {
      await transportador.sendMail({
        from: configuracao.remetente,
        to: dados.email,
        subject: "Redefinicao de senha - Plantel Listas",
        text: [
          "Recebemos uma solicitacao para redefinir sua senha.",
          "",
          "Use o link abaixo dentro do prazo informado:",
          dados.link,
          "",
          "Se voce nao fez esta solicitacao, ignore esta mensagem."
        ].join("\n")
      });
    },
    verificarConexao: function verificarConexao() {
      return transportador.verify();
    }
  };
}

function criarEmailProvider(configuracao, logger) {
  if (!configuracaoSmtpCompleta(configuracao)) {
    return criarEmailProviderNaoConfigurado(logger);
  }

  return criarEmailProviderSmtp(configuracao);
}

function criarEmailProviderFake() {
  const mensagens = [];

  return {
    enviarRecuperacaoSenha: async function armazenarMensagem(dados) {
      mensagens.push(Object.assign({}, dados));
    },
    obterMensagens: function obterMensagens() {
      return mensagens.slice();
    },
    limpar: function limpar() {
      mensagens.length = 0;
    }
  };
}

module.exports = {
  criarEmailProvider: criarEmailProvider,
  criarEmailProviderNaoConfigurado: criarEmailProviderNaoConfigurado,
  criarEmailProviderSmtp: criarEmailProviderSmtp,
  criarEmailProviderFake: criarEmailProviderFake
};
