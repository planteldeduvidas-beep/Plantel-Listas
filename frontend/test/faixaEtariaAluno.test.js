import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { readFileSync } from 'node:fs';

test('faixas minimizam dados e nao confundem declaracao com verificacao', async () => {
  const vite=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false},appType:'custom'});
  try {
    const caminho=nome=>new URL('../src/'+nome,import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1');
    const {CampoFaixaEtaria}=await vite.ssrLoadModule(caminho('FaixaEtariaAluno.jsx'));
    const html=renderToStaticMarkup(React.createElement(CampoFaixaEtaria,{valor:'',aoAlterar:()=>{}}));
    assert.match(html,/Selecione uma opção/); assert.match(html,/required/);
    for (const opcao of ['Menos de 12 anos','12 a 17 anos','18 anos ou mais']) assert.ok(html.includes(opcao));
    assert.match(html,/não uma comprovação/); assert.doesNotMatch(html,/type="date"|type="file"|CPF/);
    const componente=readFileSync(new URL('../src/FaixaEtariaAluno.jsx',import.meta.url),'utf8');
    const gate=readFileSync(new URL('../src/ExigirFaixaEtariaAluno.jsx',import.meta.url),'utf8');
    assert.doesNotMatch(gate,/Agora não|aoFechar|onClick=.*definirDados/);
    assert.match(gate,/usuario\.papel !== 'aluno'/); assert.match(gate,/if \(dados.faixaEtaria\) return children/);
    const {PerguntaFaixaEtaria}=await vite.ssrLoadModule(caminho('ExigirFaixaEtariaAluno.jsx'));
    const modal=renderToStaticMarkup(React.createElement(PerguntaFaixaEtaria,{valor:'',aoAlterar:()=>{},aoSalvar:()=>{},salvando:false}));
    assert.match(modal,/role="dialog"/); assert.match(modal,/aria-modal="true"/); assert.match(modal,/disabled=""/);
    assert.doesNotMatch(modal,/Agora não|Fechar|type="date"|type="file"/);
    const cadastro=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
    assert.match(cadastro,/tela === 'cadastro' && <CampoFaixaEtaria/);
    const suporte=readFileSync(new URL('../src/Suporte.jsx',import.meta.url),'utf8');
    assert.match(suporte,/Conferir meus dados em Meu perfil/);
    const {obterAreaPermitida}=await vite.ssrLoadModule(caminho('navegacao.js'));
    assert.equal(obterAreaPermitida('aluno','?area=meuPerfil'),'meuPerfil');
    assert.equal(obterAreaPermitida('admin','?area=meuPerfil'),'estatisticas');
    assert.equal(obterAreaPermitida('professor','?area=meuPerfil'),'acervo');
    const {faixaBloqueadaNoPerfil}=await vite.ssrLoadModule(caminho('MeuPerfil.jsx'));
    assert.equal(faixaBloqueadaNoPerfil('menos_12'),true); assert.equal(faixaBloqueadaNoPerfil('12_17'),true);
    assert.equal(faixaBloqueadaNoPerfil('18_mais'),false);
    const perfil=readFileSync(new URL('../src/MeuPerfil.jsx',import.meta.url),'utf8');
    assert.match(perfil,/desabilitado=\{salvando \|\| faixaProtegida\}/); assert.match(perfil,/Solicitar correção ao Suporte/);
    assert.doesNotMatch(perfil,/Última entrada|ultimoAcesso/);
    const parceiros=readFileSync(new URL('../src/ParceirosSidebar.jsx',import.meta.url),'utf8');
    assert.match(parceiros,/site externo, abre em nova aba/);
    assert.match(parceiros,/listarParceiros\(\)/); assert.doesNotMatch(parceiros,/faixaEtaria|usuario\.id|historico|busca/);
    const versoes=JSON.parse(readFileSync(new URL('../../shared/documentosLegais.json',import.meta.url),'utf8'));
    assert.equal(versoes.privacidade,'2026-10-06');
    const politica=readFileSync(new URL('../src/PaginaInstitucional.jsx',import.meta.url),'utf8');
    assert.match(politica,/versoesDocumentos\[documento\]/); assert.match(politica,/Crianças, adolescentes e responsáveis/);
    assert.match(politica,/nem encerra automaticamente contas existentes/); assert.match(politica,/não verifica a idade/);
  } finally { await vite.close(); }
});
