import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('lembrete e informativo, aparece somente quando indicado e mantem acao de atualizacao', async () => {
  const vite = await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false},appType:'custom'});
  try {
    const { LembreteEmailConta } = await vite.ssrLoadModule(new URL('../src/EmailConta.jsx',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
    for (const papel of ['aluno','professor','admin']) {
      const html = renderToStaticMarkup(React.createElement(LembreteEmailConta,{usuario:{papel,emailPrecisaRevisao:true},aoAtualizar:()=>{}}));
      assert.match(html,/Seu acesso ao Plantel continua disponível/);
      assert.match(html,/Atualizar ou confirmar e-mail/);
      assert.equal(html.includes('disabled'),false);
      assert.equal(renderToStaticMarkup(React.createElement(LembreteEmailConta,{usuario:{papel,emailPrecisaRevisao:false}})),'');
    }
  } finally { await vite.close(); }
});

test('formulario retoma CSRF expirado uma vez sem repetir falhas de permissao', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const chamadas = [];
  let consultas = 0, envios = 0;
  globalThis.fetch = async (url, opcoes) => {
    chamadas.push({url,opcoes});
    if (url.endsWith('/csrf')) return Response.json({csrfToken:`csrf-${++consultas}`});
    envios++;
    return envios === 1 ? Response.json({erro:{codigo:'CSRF_INVALIDO',mensagem:'Token expirado'}},{status:403}) : Response.json({mensagem:'Link enviado'});
  };
  const api = await import('../src/api.js?teste-expiracao-csrf');
  const resposta = await api.solicitarConfirmacaoEmail('aluno@outlook.com','Senha-forte-123');
  assert.equal(resposta.mensagem,'Link enviado');
  assert.equal(chamadas.length,4);
  assert.equal(chamadas[1].opcoes.body,chamadas[3].opcoes.body);
  assert.equal(chamadas[3].opcoes.headers['X-CSRF-Token'],'csrf-2');
  let negadas = 0;
  globalThis.fetch = async () => { negadas++; return Response.json({erro:{codigo:'SEM_PERMISSAO',mensagem:'Acesso negado'}},{status:403}); };
  await assert.rejects(api.confirmarEmail('token'),e => e.codigo==='SEM_PERMISSAO');
  assert.equal(negadas,1);
});

test('CSRF persistentemente invalido encerra a retentativa e mostra o erro', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  let chamadas = 0;
  globalThis.fetch = async url => {
    chamadas++;
    return url.endsWith('/csrf') ? Response.json({csrfToken:'csrf'}) : Response.json({erro:{codigo:'CSRF_INVALIDO',mensagem:'Token invalido'}},{status:403});
  };
  const api = await import('../src/api.js?teste-csrf-persistente');
  await assert.rejects(api.confirmarEmail('token'),e => e.codigo==='CSRF_INVALIDO');
  assert.equal(chamadas,4);
});
