import test from "node:test";
import assert from "node:assert/strict";
import { pendenciasDaSelecao, validarOrganizacaoPendente } from "../src/organizacaoPendente.js";

const pastas = [
  { id: 1, disciplinaPendente: false, concursoPendente: true },
  { id: 2, disciplinaPendente: true, concursoPendente: false }
];

test("mostra somente os campos pendentes das pastas marcadas", () => {
  assert.deepEqual(pendenciasDaSelecao(pastas, [1]), { disciplina: false, concurso: true });
  assert.deepEqual(pendenciasDaSelecao(pastas, [1, 2]), { disciplina: true, concurso: true });
});

test("nao conclui enquanto um campo pendente permanece sem classificacao", () => {
  assert.match(validarOrganizacaoPendente(pastas, [], "manter", "manter"), /Marque/);
  assert.match(validarOrganizacaoPendente(pastas, [1], "manter", "manter"), /concurso/i);
  assert.match(validarOrganizacaoPendente(pastas, [1, 2], "manter", "nao_se_aplica"), /disciplina/i);
  assert.match(validarOrganizacaoPendente(pastas, [1], "manter", "herdar"), /concurso/i);
  assert.equal(validarOrganizacaoPendente(pastas, [1], "manter", "nao_se_aplica"), "");
  assert.equal(validarOrganizacaoPendente(pastas, [1, 2], "definida:3", "nao_se_aplica"), "");
});
