import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {readFileSync} from 'node:fs';
test('ajuda de conta explica prazo, contato alternativo e seguranca sem pedir senha',async()=>{
  const vite=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false},appType:'custom'});
  try {
    const caminho=new URL('../src/AjudaConta.jsx',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1');
    const {default:AjudaConta}=await vite.ssrLoadModule(caminho);
    const html=renderToStaticMarkup(React.createElement(AjudaConta,{aoVoltar:()=>{}}));
    assert.match(html,/24 horas/); assert.match(html,/Spam ou Lixo/);
    assert.match(html,/name="emailConta"/);assert.match(html,/<input type="email"[^>]+name="emailResposta"/);
    assert.match(html,/Pode ser diferente/);assert.match(html,/Não envie sua senha/);
    assert.doesNotMatch(html,/type="password"/);assert.match(html,/maxLength="3500"/);
    const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
    assert.match(app,/Problemas com sua conta\?/);assert.match(app,/tela === "ajudaConta" \? <AjudaConta/);
  } finally {await vite.close();}
});
