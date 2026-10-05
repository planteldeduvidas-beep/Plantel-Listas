import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {createServer} from "vite";
import {readFileSync} from "node:fs";

test("menu identifica usuario por ID e confirmacao centralizada continua acessivel",async()=>{
  const vite=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false},appType:"custom"});
  const arquivo=nome=>new URL("../src/"+nome,import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,"$1");
  try {
    const {default:Menu}=await vite.ssrLoadModule(arquivo("MenuUsuario.jsx"));
    const html=renderToStaticMarkup(React.createElement(Menu,{item:{id:42,nome:"Pessoa <Teste>",ativo:true},proprio:false,aoAcao:()=>{}}));
    assert.match(html,/Mais opções para Pessoa &lt;Teste&gt;/);
    assert.match(html,/aria-expanded="false"/);
    const {AguardarConfirmacaoCadastro}=await vite.ssrLoadModule(arquivo("CadastroEmail.jsx"));
    const espera=renderToStaticMarkup(React.createElement(AguardarConfirmacaoCadastro,{emailAtual:"aluno@escola.edu.br",mensagemInicial:"Cadastro pendente salvo",aoVoltar:()=>{}}));
    assert.match(espera,/confirmacao-centralizada/);
    assert.match(espera,/Sua conta só será criada depois disso/);
    assert.match(espera,/Spam ou Lixo eletrônico/);
    assert.match(espera,/<details/);
    const {mensagemHumana}=await vite.ssrLoadModule(arquivo("ComponentesInterface.jsx"));
    assert.match(mensagemHumana({codigo:"ENVIO_EMAIL_INDISPONIVEL",status:503,message:"Erro"}),/preservado/);
    assert.equal(mensagemHumana({codigo:"OUTRA_FALHA",status:503,message:"SQL secreto"}).includes("SQL"),false);
  } finally {await vite.close();}
});

test("gestao usa portal, pagina existente e rejeita resultados de busca ultrapassada",()=>{
  const src=readFileSync(new URL("../src/AdministracaoFase7.jsx",import.meta.url),"utf8");
  const menu=readFileSync(new URL("../src/MenuUsuario.jsx",import.meta.url),"utf8");
  assert.match(src,/numeroConsulta !== consultaAtual.current/);
  assert.match(src,/filtrosAplicados.current/);
  assert.match(src,/Mostrar todos/);
  assert.match(src,/obterDetalhesUsuario\(item.id\)/);
  assert.match(menu,/createPortal/);
  assert.match(menu,/document.body/);
  assert.match(menu,/window.innerHeight/);
  assert.match(menu,/aoAcao\(tipo, item\)/);
});
