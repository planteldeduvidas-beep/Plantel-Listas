import test from "node:test";
import assert from "node:assert/strict";
import {executarEnvio,identificarSelecao} from "../src/uploadRetomavel.js";

test("retomada consulta offset real depois de resposta perdida; finalizacao so uma vez",async()=>{
  let offset=0,finalizacoes=0,envios=0,perdeu=false;
  const arquivo=new File([new Uint8Array(524288)],"aula.mp4");
  const atual=()=>({id:"teste",recebido:offset,tamanho:arquivo.size,chunkBytes:262144,estado:offset===arquivo.size?"enviado":"enviando"});
  const request=async(path,op)=>{
    if(path.endsWith("/partes")){
      assert.equal(Number(op.headers["X-Upload-Offset"]),offset);
      offset+=op.body.size;envios++;
      if(!perdeu){perdeu=true;throw Object.assign(new Error("rede"),{status:503});}
    }
    if(path.endsWith("/finalizar")){finalizacoes++;return {...atual(),estado:"concluido"};}
    return atual();
  };
  const progresso=[];
  await executarEnvio(arquivo,{id:"teste"},v=>progresso.push(v.recebido),{request,esperar:async()=>{}});
  assert.equal(envios,2);assert.equal(finalizacoes,1);assert.equal(progresso.at(-1),arquivo.size);
});
test("retry limitado, erros de permissao nao repetidos e selecao identificada sem ler arquivo inteiro",async()=>{
  const arquivo=new File([new Uint8Array(100000)],"aula.mp4",{lastModified:123});
  const identificacao=await identificarSelecao(arquivo);assert.equal(identificacao.tamanho,100000);assert.equal(Buffer.from(identificacao.assinatura,"base64").length,16);
  let chamadas=0;
  await assert.rejects(executarEnvio(arquivo,{id:"teste"},()=>{},{request:async()=>{chamadas++;throw Object.assign(new Error("negado"),{status:403});},esperar:async()=>{}}));
  assert.equal(chamadas,1);chamadas=0;
  await assert.rejects(executarEnvio(arquivo,{id:"teste"},()=>{},{request:async()=>{chamadas++;throw new Error("offline");},esperar:async()=>{}}));
  assert.equal(chamadas,3);
});
