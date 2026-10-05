import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
test('aceite inicia desmarcado, exige escolha e oferece documentos em outra aba',async()=>{
  const vite=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false},appType:'custom'});
  try {
    const caminho=new URL('../src/TermosAluno.jsx',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1');
    const {CaixaAceiteTermos,aceiteAtual}=await vite.ssrLoadModule(caminho);
    const html=renderToStaticMarkup(React.createElement(CaixaAceiteTermos,{marcado:false,aoAlterar:()=>{}}));
    assert.match(html,/type="checkbox"/);assert.match(html,/required/);assert.doesNotMatch(html,/checked=""/);
    assert.match(html,/href="\/termos" target="_blank"/);assert.match(html,/href="\/privacidade" target="_blank"/);
    assert.equal(aceiteAtual(false).aceito,false);
    assert.equal(aceiteAtual(true).termos,'2026-09-21');
  } finally {await vite.close();}
});
