import test from 'node:test';
import assert from 'node:assert/strict';
import { carregarDadosArea } from '../src/dadosAreaPainel.js';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

function cenario() {
  const chamadas = [];
  function resposta(nome, dados) { return async () => { chamadas.push(nome); return dados; }; }
  return { chamadas, api: {
    categorias: { listar: resposta('categorias', {categorias:[{id:1}]}) },
    disciplinas: { listar: resposta('disciplinas', {disciplinas:[{id:2}]}) },
    concursos: { listar: resposta('concursos', {concursos:[{id:3}]}) },
    listarUsuarios: resposta('usuarios', {usuarios:[{id:4}]}),
    listarPermissoes: resposta('permissoes', {permissoes:[{id:5}]}),
    listarDisciplinasDosProfessores: resposta('vinculos', {disciplinas:[{id:6}]}),
    obterStatusGoogleDrive: resposta('drive', {googleDrive:{conectado:true}}),
    obterStatusDasAtualizacoesGoogleDrive: resposta('changes', {acompanhamento:{acompanhamentoAtivo:true}}),
    listarMinhasPermissoes: resposta('minhas', {permissoes:[{id:7}]})
  } };
}

test('entrada e areas independentes nao fazem oito consultas administrativas nem estrutura inutilizada', async () => {
  for (const papel of ['admin','aluno','professor']) {
    for (const area of ['estatisticas','usuarios','acervo','historico','suporte','tutorial','meuPerfil','parceiros','avisos']) {
      const {api,chamadas}=cenario();
      assert.deepEqual(await carregarDadosArea(papel,area,api),{});
      assert.deepEqual(chamadas,[]);
    }
  }
});

test('organizacao, acessos e Drive carregam somente dependencias da area, preservando respostas', async () => {
  const expectativas = {
    organizacao: ['categorias','disciplinas','concursos'],
    acessos: ['categorias','disciplinas','usuarios','permissoes','vinculos'],
    drive: ['drive','changes']
  };
  for (const [area,esperadas] of Object.entries(expectativas)) {
    const {api,chamadas}=cenario(); const dados=await carregarDadosArea('admin',area,api);
    assert.deepEqual(chamadas,esperadas);
    assert.ok(Object.keys(dados).length);
  }
  const {api,chamadas}=cenario();
  assert.deepEqual(await carregarDadosArea('professor','minhasPastas',api),{minhasPermissoes:[{id:7}]});
  assert.deepEqual(chamadas,['minhas']);
});

test('aluno/professor nao disparam consultas de admin e erro nao vira resposta vazia', async () => {
  for (const papel of ['aluno','professor']) {
    const {api,chamadas}=cenario();
    for (const area of ['acessos','drive','organizacao']) assert.deepEqual(await carregarDadosArea(papel,area,api),{});
    assert.deepEqual(chamadas,[]);
  }
  const {api}=cenario(); api.categorias.listar=async()=>{throw new Error('falha-controlada');};
  await assert.rejects(carregarDadosArea('admin','organizacao',api),/falha-controlada/);
});

test('login ja mostra estrutura enquanto verifica sessao, sem liberar envio nem painel', async () => {
  const vite=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false},appType:'custom'});
  const janelaAnterior=globalThis.window;
  globalThis.window={location:{pathname:'/',search:''},localStorage:{getItem:()=>null}};
  try {
    const caminho=new URL('../src/App.jsx',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1');
    const {default:App}=await vite.ssrLoadModule(caminho);
    const {LimiteCarregamento}=await vite.ssrLoadModule(new URL('../src/CarregamentoSobDemanda.jsx',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
    const limite=new LimiteCarregamento({children:null});
    limite.state=LimiteCarregamento.getDerivedStateFromError();
    const falha=renderToStaticMarkup(limite.render());
    assert.match(falha,/Confira sua conexão/); assert.match(falha,/Atualizar página/);
    const html=renderToStaticMarkup(React.createElement(App));
    assert.match(html,/Que bom ter você de volta/);
    assert.match(html,/Verificando sua sessão/);
    assert.match(html,/<input[^>]*type="email"[^>]*disabled/);
    assert.match(html,/<button[^>]*type="submit"[^>]*disabled/);
    assert.doesNotMatch(html,/Menu principal|Meu perfil|ADMINISTRAÇÃO/);
    globalThis.window.location.search='?tokenRecuperacao=token-ficticio';
    globalThis.window.location.pathname='/';
    globalThis.window.history={state:null,replaceState:()=>{}};
    assert.match(renderToStaticMarkup(React.createElement(App)),/Preparando seu acesso/);
  } finally {
    if (janelaAnterior===undefined) delete globalThis.window; else globalThis.window=janelaAnterior;
    await vite.close();
  }
});
