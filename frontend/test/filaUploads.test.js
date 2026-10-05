import test from 'node:test';
import assert from 'node:assert/strict';
import {criarFila,enviarFila} from '../src/filaUploads.js';

function dados(n) {
  const form=new FormData();
  form.set('categoriaId','42'); form.set('nome','Titulo escolhido');
  for(let i=0;i<n;i++)form.append('arquivo',new File(['%PDF-1.4 teste'],`arquivo-${i}.pdf`));
  return form;
}
test('fila limita a dez, preserva destino e usa nomes individuais em lote',()=>{
  assert.throws(()=>criarFila(dados(11)),/10/);
  assert.throws(()=>criarFila(dados(0)),/Selecione/);
  const fila=criarFila(dados(10));
  assert.equal(fila.length,10);
  assert.ok(fila.every(item=>item.dados.get('categoriaId')==='42'&&!item.dados.has('nome')));
  assert.equal(criarFila(dados(1))[0].dados.get('nome'),'Titulo escolhido');
});
test('fila e sequencial, para na falha e retoma sem reenviar concluidos',async()=>{
  const fila=criarFila(dados(3));let simultaneos=0;const enviados=[];
  const enviar=async form=>{simultaneos++;assert.equal(simultaneos,1);await Promise.resolve();enviados.push(form.get('arquivo').name);simultaneos--;return enviados.length!==2;};
  assert.equal(await enviarFila(fila,enviar,()=>{}),false);
  assert.deepEqual(fila.map(x=>x.estado),['concluido','interrompido','aguardando']);
  assert.equal(await enviarFila(fila,enviar,()=>{}),true);
  assert.deepEqual(enviados,['arquivo-0.pdf','arquivo-1.pdf','arquivo-1.pdf','arquivo-2.pdf']);
});
