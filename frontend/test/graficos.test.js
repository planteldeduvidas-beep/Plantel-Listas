import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('barras mostram valores, escapam rótulos e tratam vazio e zero', async () => {
  const vite = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { default: Grafico } = await vite.ssrLoadModule(new URL('../src/GraficoBarras.jsx', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
    const html = renderToStaticMarkup(React.createElement(Grafico, { dados: [{ nome: '<script>teste</script>', quantidade: 0 }, { nome: 'Matemática', quantidade: 12 }] }));
    assert.ok(html.includes('width:0%'));
    assert.ok(html.includes('width:100%'));
    assert.ok(html.includes('12'));
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(!html.includes('<script>'));
    assert.match(renderToStaticMarkup(React.createElement(Grafico, { dados: [] })), /Nenhum registro/);
  } finally { await vite.close(); }
});
