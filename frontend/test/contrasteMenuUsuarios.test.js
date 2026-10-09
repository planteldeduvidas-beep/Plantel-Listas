import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function luminancia(hex) {
  const canais = hex.match(/[a-f\d]{2}/gi).map(c => {
    const v = parseInt(c,16)/255;
    return v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4;
  });
  return canais[0]*.2126+canais[1]*.7152+canais[2]*.0722;
}
test('menu define texto e fundo no hover/foco e preserva contraste nos dois temas', () => {
  const css=readFileSync(new URL('../src/gestaoUsuarios.css',import.meta.url),'utf8');
  for (const [texto,fundo] of [['143c34','d9e8e3'],['9e2828','d9e8e3'],['e7f2ee','294b41'],['ffb3b3','294b41']]) {
    const l=[luminancia(texto),luminancia(fundo)].sort((a,b)=>b-a);
    assert.ok((l[0]+.05)/(l[1]+.05)>=4.5);
    assert.ok(css.includes('#'+texto)); assert.ok(css.includes('#'+fundo));
  }
  assert.match(css,/:root \.menu-usuario-flutuante button:hover:not\(:disabled\).*color:#143c34/);
  assert.match(css,/:root\[data-tema="escuro"\] \.menu-usuario-flutuante button:hover:not\(:disabled\).*color:#e7f2ee/);
  assert.match(css,/button:focus-visible \{ outline:2px/);
});
