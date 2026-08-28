const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const caminhoNavegacao = path.resolve(__dirname, "../../frontend/src/navegacao.js");

test("navegacao do frontend limita areas e representa pastas na URL", async function testarNavegacao() {
  const navegacao = await import(pathToFileURL(caminhoNavegacao).href);

  assert.equal(navegacao.obterAreaPermitida("admin", "?area=usuarios"), "usuarios");
  assert.equal(navegacao.obterAreaPermitida("aluno", "?area=usuarios"), "acervo");
  assert.equal(navegacao.obterAreaPermitida("professor", "?area=minhasPastas"), "minhasPastas");
  assert.equal(navegacao.obterPastaDaUrl("?area=acervo&pasta=47"), 47);
  assert.equal(navegacao.obterPastaDaUrl("?area=acervo&pasta=../../segredo"), null);
  assert.equal(navegacao.criarUrlDaNavegacao("/", "acervo", 47), "/?area=acervo&pasta=47");
  assert.equal(navegacao.criarUrlDaNavegacao("/", "usuarios", 47), "/?area=usuarios");
});

test("retornos temporarios sao removidos sem apagar o destino interno", async function testarLimpeza() {
  const navegacao = await import(pathToFileURL(caminhoNavegacao).href);
  assert.equal(
    navegacao.limparParametrosTemporarios("/", "?googleDrive=conectado&area=drive&oauthPopup=1"),
    "/?area=drive"
  );
  assert.equal(
    navegacao.limparParametrosTemporarios("/", "?tokenRecuperacao=segredo&area=acervo"),
    "/?area=acervo"
  );
});

test("OAuth usa janela separada para nao misturar o Google ao historico principal", function testarOAuth() {
  const painel = fs.readFileSync(path.resolve(__dirname, "../../frontend/src/PainelAcervo.jsx"), "utf8");
  assert.match(painel, /window\.open\(/);
  assert.match(painel, /janelaOAuth\.location\.replace\(resultado\.urlAutorizacao\)/);
  assert.doesNotMatch(painel, /window\.location\.assign\(resultado\.urlAutorizacao\)/);
});

test("gestao do professor compara a pasta publica do material", function testarPastaDoMaterial() {
  const biblioteca = fs.readFileSync(
    path.resolve(__dirname, "../../frontend/src/BibliotecaAcervo.jsx"),
    "utf8"
  );

  assert.match(biblioteca, /const categoriaDoMaterialId = item\.pasta \? item\.pasta\.id : null/);
  assert.match(biblioteca, /pasta\.id === categoriaDoMaterialId/);
  assert.doesNotMatch(biblioteca, /pasta\.id === item\.categoriaId/);
});

test("desenvolvimento entrega conteudo pela mesma origem usando proxy seguro", function testarProxyLocal() {
  const api = fs.readFileSync(path.resolve(__dirname, "../../frontend/src/api.js"), "utf8");
  const vite = fs.readFileSync(path.resolve(__dirname, "../../frontend/vite.config.js"), "utf8");

  assert.match(api, /import\.meta\.env\.DEV \? "\/api" : API_CONFIGURADA/);
  assert.match(vite, /"\/api"/);
  assert.match(vite, /target: destinoApi/);
});
