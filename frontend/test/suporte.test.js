import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { obterDuvidasSuporte } from '../src/duvidasSuporte.js';

test('aviso de spam permanece na recuperação antes e depois do envio', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /tela === "recuperar" \|\| tela === "cadastro"/);
  const aviso = readFileSync(new URL('../src/AvisoEmail.jsx', import.meta.url), 'utf8');
  assert.match(aviso, /Spam ou Lixo eletrônico/);
  assert.match(aviso, /qualquer provedor/);
});

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
    assert.equal(duvidas.length, 7);
    assert.match(JSON.stringify(duvidas), /sugestões, opiniões ou elogios/);
  }
});

test('todos os perfis recebem orientação sobre e-mails na pasta de spam', () => {
  for (const papel of ['aluno', 'professor', 'admin']) {
    const duvida = obterDuvidasSuporte(papel).find(item => item.pergunta.startsWith('Não recebi o e-mail'));
    assert.ok(duvida);
    assert.match(duvida.resposta, /Spam ou Lixo eletrônico/);
    assert.match(duvida.resposta, /Não é spam/);
  }
});
