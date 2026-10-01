import test from 'node:test';
import assert from 'node:assert/strict';
import { obterOpcoesPastas } from '../src/opcoesPastas.js';

const pastas = Array.from({ length: 180 }, (_, i) => ({ id: i + 1, nome: `Pasta ${i}`, caminho: `Raiz / Pasta ${i}` }));
pastas.push({ id: 181, nome: 'Resolução Listas', caminho: 'Matemática / Resolução Listas' });
pastas.push({ id: 182, nome: 'Resolução Listas', caminho: 'Física / Resolução Listas' });

test('todas as pastas ficam acessíveis carregando mais resultados', () => {
  assert.equal(obterOpcoesPastas(pastas, '', '', 80).opcoes.length, 80);
  assert.equal(obterOpcoesPastas(pastas, '', '', 160).opcoes.length, 160);
  assert.deepEqual(obterOpcoesPastas(pastas, '', '', 240).opcoes, pastas);
});
test('busca alcança pastas além de 80, ignora acentos e diferencia caminhos', () => {
  assert.equal(obterOpcoesPastas(pastas, 'resolucao', '').total, 2);
  assert.equal(obterOpcoesPastas(pastas, 'física / resolução', '').opcoes[0].id, 182);
  assert.equal(obterOpcoesPastas(pastas, 'inexistente', '').total, 0);
});
test('seleção nova permanece visível sem duplicar ou incluir pasta não autorizada', () => {
  const resultado = obterOpcoesPastas(pastas, '', '181');
  assert.equal(resultado.opcoes[0].id, 181);
  assert.equal(obterOpcoesPastas(pastas, 'resolucao', '181').opcoes.length, 2);
  assert.equal(obterOpcoesPastas(pastas.slice(0, 80), '', '181').opcoes.some(p => p.id === 181), false);
});
