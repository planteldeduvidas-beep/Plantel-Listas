const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("tema inicial e claro e o escuro depende de escolha explicita", function testarTemaInicial() {
  const componentes = fs.readFileSync(
    path.resolve(__dirname, "../../frontend/src/ComponentesInterface.jsx"),
    "utf8"
  );

  assert.match(componentes, /localStorage\.getItem\("plantel-tema"\) === "escuro" \? "escuro" : "claro"/);
  assert.doesNotMatch(componentes, /localStorage\.getItem\("plantel-tema"\) === "claro" \? "claro" : "escuro"/);
});
