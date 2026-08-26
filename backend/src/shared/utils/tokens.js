const crypto = require("node:crypto");

function gerarTokenAleatorio() {
  return crypto.randomBytes(32).toString("base64url");
}

function gerarHashDoToken(token) {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

function adicionarHoras(data, horas) {
  return new Date(data.getTime() + horas * 60 * 60 * 1000);
}

function adicionarMinutos(data, minutos) {
  return new Date(data.getTime() + minutos * 60 * 1000);
}

module.exports = {
  gerarTokenAleatorio: gerarTokenAleatorio,
  gerarHashDoToken: gerarHashDoToken,
  adicionarHoras: adicionarHoras,
  adicionarMinutos: adicionarMinutos
};

