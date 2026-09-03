const test = require("node:test");
const assert = require("node:assert/strict");
const {
  criarEmailProvider,
  criarEmailProviderSmtp
} = require("../src/shared/providers/emailProvider");

test("mantem envio indisponivel quando o SMTP esta incompleto", async function testarSmtpIncompleto() {
  const provider = criarEmailProvider({
    host: "smtp.example.com",
    porta: 465,
    seguro: true,
    usuario: "usuario@example.com",
    senha: "",
    remetente: "usuario@example.com"
  });

  await assert.rejects(function enviar() {
    return provider.enviarRecuperacaoSenha({
      email: "destinatario@example.com",
      link: "http://localhost/redefinir"
    });
  }, /EMAIL_PROVIDER_NAO_CONFIGURADO/);
});

test("constroi provider SMTP sem abrir conexao antecipadamente", function testarProviderSmtp() {
  const provider = criarEmailProviderSmtp({
    host: "smtp.example.com",
    porta: 465,
    seguro: true,
    usuario: "usuario@example.com",
    senha: "segredo-de-teste",
    remetente: "usuario@example.com"
  });

  assert.equal(typeof provider.enviarRecuperacaoSenha, "function");
  assert.equal(typeof provider.enviarSuporte, "function");
  assert.equal(typeof provider.verificarConexao, "function");
});
