import test from 'node:test';
import assert from 'node:assert/strict';
import { obterOpcoesPastas } from '../src/opcoesPastas.js';

const pastas = Array.from({ length: 180 }, (_, i) => ({ id: i + 1, nome: `Pasta ${i}`, caminho: `Raiz / Pasta ${i}` }));
pastas.push({ id: 181, nome: 'Resolução Listas', caminho: 'Matemática / Resolução Listas' });
pastas.push({ id: 182, nome: 'Resolução Listas', caminho: 'Física / Resolução Listas' });

test('todas as pastas ficam acessíveis sem carregar mais, inclusive após limpar busca', () => {
  assert.equal(obterOpcoesPastas(pastas, '', '').opcoes.length, 182);
  const achada = obterOpcoesPastas(pastas, 'resolucao', '').opcoes[0];
  assert.ok(obterOpcoesPastas(pastas, '', '').opcoes.some(p => p.id === achada.id));
});
test('ordem por nome em portugues e caminho como desempate sem alterar entrada', () => {
  const entrada = [{id:1,nome:'Zebra'}, {id:2,nome:'Álgebra'}, {id:3,nome:'Resolução',caminho:'Z / Resolução'}, {id:4,nome:'Resolução',caminho:'A / Resolução'}];
  assert.deepEqual(obterOpcoesPastas(entrada,'','').opcoes.map(p=>p.id),[2,4,3,1]);
  assert.equal(entrada[0].id,1);
});
test('busca alcança pastas além de 80, ignora acentos e diferencia caminhos', () => {
  assert.equal(obterOpcoesPastas(pastas, 'resolucao', '').total, 2);
  assert.equal(obterOpcoesPastas(pastas, 'física / resolução', '').opcoes[0].id, 182);
  assert.equal(obterOpcoesPastas(pastas, 'inexistente', '').total, 0);
});
test('seleção nova permanece visível sem duplicar ou incluir pasta não autorizada', () => {
  const resultado = obterOpcoesPastas(pastas, '', '181');
  assert.ok(resultado.opcoes.some(p => p.id === 181));
  assert.equal(obterOpcoesPastas(pastas, 'resolucao', '181').opcoes.length, 2);
  assert.equal(obterOpcoesPastas(pastas.slice(0, 80), '', '181').opcoes.some(p => p.id === 181), false);
});
