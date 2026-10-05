const test = require("node:test");
const assert = require("node:assert/strict");
const {
  criarEmailProvider,
  criarEmailProviderSmtp
} = require("../src/shared/providers/emailProvider");

test("confirmacao e recuperacao entregam um unico destinatario e suporte usa replyTo", async t => {
  const nodemailer = require("nodemailer");
  const original = nodemailer.createTransport;
  const mensagens = [];
  nodemailer.createTransport = () => ({ sendMail: async mensagem => { mensagens.push(mensagem); } });
  t.after(() => { nodemailer.createTransport = original; });
  const provider = criarEmailProviderSmtp({remetente:"plantel@example.com"});
  await provider.enviarConfirmacaoEmail({destinatario:"aluno@outlook.com",alteracao:true,link:"https://plantel.example/?tokenEmail=qa"});
  await provider.enviarRecuperacaoSenha({destinatario:"aluno@proton.me",link:"https://plantel.example/?tokenRecuperacao=qa"});
  await provider.enviarSuporte({destinatario:"equipe@example.com",email:"aluno@icloud.com",nome:"Aluno",papel:"aluno",assunto:"Duvida",mensagem:"Teste controlado"});
  assert.deepEqual(mensagens[0].to,{address:"aluno@outlook.com"});
  assert.match(mensagens[0].text,/1 hora/);
  assert.match(mensagens[0].text,/ate a confirmacao/);
  assert.deepEqual(mensagens[1].to,{address:"aluno@proton.me"});
  assert.deepEqual(mensagens[2].to,{address:"equipe@example.com"});
  assert.deepEqual(mensagens[2].replyTo,{address:"aluno@icloud.com"});
});

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
