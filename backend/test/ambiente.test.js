const test = require("node:test");
const assert = require("node:assert/strict");
const { validarVariaveisDeAmbiente } = require("../src/shared/config/ambiente");

function criarVariaveisValidas() {
  return {
    NODE_ENV: "test",
    PORT: "3000",
    LOG_LEVEL: "silent",
    CORS_ORIGENS: "http://localhost:5173",
    FRONTEND_URL: "http://localhost:5173",
    TRUST_PROXY: "0",
    CSRF_SECRET: "segredo-de-teste-com-mais-de-32-caracteres",
    SESSION_DURATION_HOURS: "168",
    PASSWORD_RESET_DURATION_MINUTES: "30",
    SESSION_COOKIE_NAME: "plantel_sessao",
    CSRF_COOKIE_NAME: "plantel_csrf",
    RATE_LIMIT_WINDOW_MINUTES: "15",
    AUTH_RATE_LIMIT_MAX: "10",
    RECOVERY_RATE_LIMIT_MAX: "5",
    DB_HOST: "127.0.0.1",
    DB_PORT: "3306",
    DB_USER: "root",
    DB_PASSWORD: "",
    DB_NAME: "plantel_listas_test",
    DB_CONNECTION_LIMIT: "2"
  };
}

test("aceita uma configuracao valida", function testarConfiguracaoValida() {
  const configuracao = validarVariaveisDeAmbiente(criarVariaveisValidas());
  assert.equal(configuracao.ambiente, "test");
  assert.equal(configuracao.banco.nome, "plantel_listas_test");
  assert.equal(configuracao.email.host, "");
  assert.equal(configuracao.email.porta, 465);
  assert.equal(configuracao.email.seguro, true);
});

test("valida a configuracao SMTP quando informada", function testarSmtp() {
  const variaveis = criarVariaveisValidas();
  variaveis.SMTP_HOST = "smtp.example.com";
  variaveis.SMTP_PORT = "587";
  variaveis.SMTP_SECURE = "false";
  variaveis.SMTP_USER = "usuario@example.com";
  variaveis.SMTP_PASSWORD = "segredo-de-teste";
  variaveis.SMTP_FROM = "usuario@example.com";
  variaveis.SUPPORT_EMAIL_TO = "SUPORTE@example.com";
  variaveis.ANALYTICS_RAW_RETENTION_DAYS = "365";
  variaveis.ANALYTICS_RETENTION_BATCH_SIZE = "1000";

  const configuracao = validarVariaveisDeAmbiente(variaveis);
  assert.equal(configuracao.email.host, "smtp.example.com");
  assert.equal(configuracao.email.porta, 587);
  assert.equal(configuracao.email.seguro, false);
  assert.equal(configuracao.email.senha, "segredo-de-teste");
  assert.equal(configuracao.suporte.destinatario, "suporte@example.com");
  assert.equal(configuracao.analytics.retencaoEventosDias, 365);
  assert.equal(configuracao.analytics.loteRetencao, 1000);
});

test("recusa destinatario de suporte e retencao invalidos", function testarAjustesFinaisInvalidos() {
  const emailInvalido = criarVariaveisValidas();
  emailInvalido.SUPPORT_EMAIL_TO = "nao-e-email";
  assert.throws(function validarEmail() {
    validarVariaveisDeAmbiente(emailInvalido);
  }, /SUPPORT_EMAIL_TO/);

  const retencaoInvalida = criarVariaveisValidas();
  retencaoInvalida.ANALYTICS_RAW_RETENTION_DAYS = "30";
  assert.throws(function validarRetencao() {
    validarVariaveisDeAmbiente(retencaoInvalida);
  }, /ANALYTICS_RAW_RETENTION_DAYS/);
});

test("falha de forma controlada quando uma env obrigatoria esta ausente", function testarEnvAusente() {
  const variaveis = criarVariaveisValidas();
  delete variaveis.DB_HOST;

  assert.throws(function validar() {
    validarVariaveisDeAmbiente(variaveis);
  }, /DB_HOST/);
});

test("recusa CORS irrestrito", function testarCorsIrrestrito() {
  const variaveis = criarVariaveisValidas();
  variaveis.CORS_ORIGENS = "*";

  assert.throws(function validar() {
    validarVariaveisDeAmbiente(variaveis);
  }, /nao pode liberar/);
});

test("valida configuracao Google Drive sem expor ou exigir segredo opcional", function testarGoogleDrive() {
  const variaveis = criarVariaveisValidas();
  variaveis.GOOGLE_DRIVE_CLIENT_ID = "cliente.apps.googleusercontent.com";
  variaveis.GOOGLE_DRIVE_CLIENT_SECRET = "segredo-google-de-teste";
  variaveis.GOOGLE_DRIVE_PASTA_RAIZ_ID = "pastaRaizTeste12345";
  variaveis.GOOGLE_DRIVE_REDIRECT_URI = "http://localhost:3000/api/integracoes/google-drive/oauth/callback";

  const configuracao = validarVariaveisDeAmbiente(variaveis);
  assert.equal(configuracao.googleDrive.clientId, "cliente.apps.googleusercontent.com");
  assert.equal(configuracao.googleDrive.clientSecret, "segredo-google-de-teste");
  assert.equal(configuracao.googleDrive.refreshToken, "");
  assert.equal(
    configuracao.googleDrive.escopo,
    "https://www.googleapis.com/auth/drive"
  );
});

test("exige HTTPS na redirect URI Google Drive em producao", function testarRedirectProducao() {
  const variaveis = criarVariaveisValidas();
  variaveis.NODE_ENV = "production";
  variaveis.GOOGLE_DRIVE_REDIRECT_URI = "http://localhost:3000/api/integracoes/google-drive/oauth/callback";

  assert.throws(function validar() {
    validarVariaveisDeAmbiente(variaveis);
  }, /GOOGLE_DRIVE_REDIRECT_URI/);
});

