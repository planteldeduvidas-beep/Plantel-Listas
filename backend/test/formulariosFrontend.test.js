const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("formularios preservam a referencia do elemento durante operacoes assincronas", function testarFormulariosAssincronos() {
  const administracao = fs.readFileSync(
    path.resolve(__dirname, "../../frontend/src/AdministracaoFase7.jsx"),
    "utf8"
  );
  const biblioteca = fs.readFileSync(
    path.resolve(__dirname, "../../frontend/src/BibliotecaAcervo.jsx"),
    "utf8"
  );

  assert.match(administracao, /const elementoFormulario = evento\.currentTarget/);
  assert.match(administracao, /new FormData\(elementoFormulario\)/);
  assert.match(administracao, /elementoFormulario\.reset\(\)/);
  assert.doesNotMatch(administracao, /await criarUsuario\([\s\S]*?evento\.currentTarget\.reset\(\)/);

  assert.match(biblioteca, /const elementoFormulario = evento\.currentTarget/);
  assert.match(biblioteca, /const enviado = await executar\(/);
  assert.match(biblioteca, /if \(enviado\) \{[\s\S]*?elementoFormulario\.reset\(\)[\s\S]*?definirMostrarEnvio\(false\)/);
});
