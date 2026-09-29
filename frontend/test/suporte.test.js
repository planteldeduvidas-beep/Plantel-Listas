import test from 'node:test';
import assert from 'node:assert/strict';
import { obterDuvidasSuporte } from '../src/duvidasSuporte.js';

test('aluno recebe histórico, sem orientações de gestão', () => {
  const texto = JSON.stringify(obterDuvidasSuporte('aluno'));
  assert.match(texto, /Meu Histórico/);
  assert.doesNotMatch(texto, /Pastas liberadas|Adicionar material|Abra Acessos/);
});
test('professor e admin recebem apenas as perguntas de seu papel', () => {
  const professor = JSON.stringify(obterDuvidasSuporte('professor'));
  assert.match(professor, /Pastas liberadas/);
  assert.doesNotMatch(professor, /Meu Histórico|Abra Acessos/);
  const admin = JSON.stringify(obterDuvidasSuporte('admin'));
  assert.match(admin, /Abra Acessos/);
  assert.doesNotMatch(admin, /Meu Histórico|Confira Pastas liberadas/);
});
test('papel desconhecido recebe somente dúvidas comuns, incluindo feedback', () => {
  for (const papel of [undefined, 'desconhecido', 'constructor']) {
    const duvidas = obterDuvidasSuporte(papel);
    assert.equal(duvidas.length, 5);
    assert.match(JSON.stringify(duvidas), /sugestões, opiniões ou elogios/);
  }
});
