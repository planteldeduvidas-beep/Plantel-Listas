import test from 'node:test';
import assert from 'node:assert/strict';
import { combinarAvisosParceiros } from '../src/avisosParceiros.js';

test('inclui dados e link exato do parceiro ativo, sem publicar arquivados', () => {
  const resultado = combinarAvisosParceiros([], [
    { id: 1, ativo: true, nome: 'Parceiro', descricao: 'Preparação', desconto: '10%', cupom: 'PLANTEL', link: 'https://example.com/?ref=plantel' },
    { id: 2, ativo: false, nome: 'Arquivado', link: 'https://example.org/' }
  ]);
  assert.deepEqual(resultado, [{ id: 'parceiro-1', texto: 'Parceiro · Preparação · 10% · Cupom: PLANTEL', url: 'https://example.com/?ref=plantel' }]);
});
test('preserva avisos independentes e substitui duplicata do mesmo link apenas na exibição', () => {
  const avisos = [{id:1,texto:'Aviso'}, {id:2,texto:'Parceiro antigo',url:'https://example.com/'}];
  const resultado = combinarAvisosParceiros(avisos, [{id:1,ativo:true,nome:'Parceiro',link:'https://example.com/'}]);
  assert.equal(resultado.length,2);
  assert.equal(resultado[0].texto,'Aviso');
  assert.equal(resultado[1].texto,'Parceiro');
  assert.equal(avisos.length,2);
});
test('sem parceiros mantém todos os avisos e aceita faixa vazia', () => {
  assert.deepEqual(combinarAvisosParceiros([],[]),[]);
  assert.equal(combinarAvisosParceiros([{id:1,texto:'Aviso'}],[])[0].texto,'Aviso');
});
