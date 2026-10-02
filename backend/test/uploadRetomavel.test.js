const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const {criarUploadRetomavelService,CHUNK_BYTES} = require("../src/modules/materiais/uploadRetomavelService");
const AppError = require("../src/shared/errors/AppError");

function ambiente() {
  const linhas = new Map(); let confirmado=0,completo=false,gravacoes=0,envios=0,apagados=0,proibido=false,expirou=false,falhaDepois=false,falhaSql=false;
  let agora=Date.now(); let ultimo;
  const repository={buscar:async id=>structuredClone(linhas.get(id)),contar:async id=>({total:[...linhas.values()].filter(s=>!["concluido","cancelado"].includes(s.estado)).length,usuario:[...linhas.values()].filter(s=>s.usuario_id===id&&!["concluido","cancelado"].includes(s.estado)).length}),
    criar:async s=>{linhas.set(s.id,{...structuredClone(s),expira_em:new Date(agora+86400000)});ultimo=s;},
    salvar:async s=>{linhas.set(s.id,{...linhas.get(s.id),...structuredClone(s)});},abandonados:async()=>[...linhas.values()].filter(s=>s.estado!=="concluido"&&new Date(s.expira_em)<=agora),falhaLimpeza:async()=>{},removerAntigos:async()=>{}};
  const item=()=>({id:ultimo.drive_id,name:ultimo.dados.nome,mimeType:ultimo.dados.mimeType,size:String(ultimo.tamanho),parents:["pastaDrive"]});
  const provider={reservarIdUpload:async()=>crypto.randomUUID(),iniciarUploadRetomavel:async()=>"https://www.googleapis.com/upload/drive/v3/files?upload_id=privado",
    transferirParteUpload:async(t,url,total,offset,corpo)=>{
      if(expirou)throw new AppError("expirada",410,"UPLOAD_EXPIRADO");
      if(corpo){envios++;confirmado=offset+corpo.length;completo=confirmado===total;if(falhaDepois){falhaDepois=false;throw new AppError("timeout",503,"UPLOAD_INTERROMPIDO");}}
      return {recebido:confirmado,completo,item:completo?item():undefined};
    },obterItem:async()=>{if(!completo)throw new AppError("ausente",404,"GOOGLE_ARQUIVO_NAO_ENCONTRADO");return item();},excluirArquivo:async()=>{apagados++;completo=false;}};
  const gestao={comTravaUpload:async fn=>fn(),autorizarUpload:async(u,d)=>{
    if(proibido||!["admin","professor"].includes(u.papel)||d.categoriaId!==1)throw new AppError("negado",403,"SEM_PERMISSAO_PASTA");
    return {refreshToken:"teste",categoria:{drivePastaId:"pastaDrive",id:1}};
  },concluirUploadRetomavel:async(u,d,c,i,id)=>{if(falhaSql)throw new Error("SQL indisponivel");gravacoes++;const s=linhas.get(id);s.estado="concluido";s.material_id=77;s.sessao_criptografada=null;}};
  const config={googleDrive:{encryptionKey:"chave-exclusiva-de-testes-com-32-caracteres"},seguranca:{tamanhoMaximoPdfBytes:50*1024*1024,tamanhoMaximoVideoRetomavelBytes:3072*1024*1024}};
  const service=criarUploadRetomavelService({repository,provider,gestao,integracaoService:{obterRefreshTokenParaUso:async()=>"teste"},configuracao:config,relogio:()=>agora});
  const usuario={id:1,papel:"professor"};
  const prefixo=Buffer.from("0000ftypisom0000");
  function inicio(tamanho=CHUNK_BYTES+16,pdf=false){return {id:crypto.randomUUID(),campos:{categoriaId:"1",nome:"Aula",disciplinaId:"",concursoId:""},arquivo:{nome:pdf?"aula.pdf":"aula.mp4",mime:pdf?"application/pdf":"video/mp4",tamanho,assinatura:(pdf?Buffer.from("%PDF-1.7 teste00!"):prefixo).subarray(0,16).toString("base64")}};}
  return {service,usuario,inicio,prefixo,linhas,provider,repository,gestao,item,
    stats:()=>({gravacoes,envios,apagados}),avancar:n=>{confirmado=n;},expirar:()=>{expirou=true;},proibir:()=>{proibido=true;},relogio:n=>{agora+=n;},falhar:()=>{falhaDepois=true;},sql:v=>{falhaSql=v;}};
}

test("PDF/admin e MP4/professor: assinatura, pasta, sessao criptografada e finalizacao idempotente",async()=>{
  for(const pdf of [true,false]){
    const a=ambiente(),inicio=a.inicio(16,pdf),u={...a.usuario,papel:pdf?"admin":"professor"};
    const s=await a.service.iniciar(u,inicio);
    assert.equal(JSON.stringify(s).includes("upload_id"),false);
    assert.ok(a.linhas.get(s.id).sessao_criptografada.startsWith("v1."));
    await a.service.parte(u,s.id,0,Buffer.from(inicio.arquivo.assinatura,"base64"));
    assert.equal(a.stats().gravacoes,0);
    assert.equal((await a.service.finalizar(u,s.id)).materialId,77);
    await a.service.finalizar(u,s.id);
    assert.equal(a.stats().gravacoes,1);
  }
});
test("retoma apos resposta perdida sem reenviar bytes confirmados; bloqueia fora de ordem e finalizacao antecipada",async()=>{
  const a=ambiente(),i=a.inicio(),s=await a.service.iniciar(a.usuario,i);
  await assert.rejects(a.service.finalizar(a.usuario,s.id),{codigo:"UPLOAD_INCOMPLETO"});
  await assert.rejects(a.service.parte(a.usuario,s.id,CHUNK_BYTES,Buffer.alloc(16)),{codigo:"UPLOAD_OFFSET_DIVERGENTE"});
  const bloco=Buffer.alloc(CHUNK_BYTES);a.prefixo.copy(bloco);a.falhar();
  await assert.rejects(a.service.parte(a.usuario,s.id,0,bloco),{codigo:"UPLOAD_INTERROMPIDO"});
  assert.equal((await a.service.consultar(a.usuario,s.id)).recebido,CHUNK_BYTES);
  await a.service.parte(a.usuario,s.id,0,bloco);
  assert.equal(a.stats().envios,1);
  await a.service.parte(a.usuario,s.id,CHUNK_BYTES,Buffer.alloc(16));
  a.sql(true);await assert.rejects(a.service.finalizar(a.usuario,s.id));
  assert.equal(a.stats().apagados,0);a.sql(false);
  await a.service.finalizar(a.usuario,s.id);assert.equal(a.stats().gravacoes,1);
});
test("2,5 GiB: offsets acima de 2 GiB, bloco final pequeno e sem buffer gigante",async()=>{
  const a=ambiente(),total=2.5*1024**3,i=a.inicio(total),s=await a.service.iniciar(a.usuario,i);
  a.avancar(total-16);
  assert.equal((await a.service.consultar(a.usuario,s.id)).recebido,total-16);
  await a.service.parte(a.usuario,s.id,total-16,Buffer.alloc(16));
  await a.service.finalizar(a.usuario,s.id);assert.equal(a.stats().gravacoes,1);
});
test("nega outro usuario, pasta nao autorizada, mutacao da sessao, tamanho e assinatura invalidos",async()=>{
  const a=ambiente(),i=a.inicio(),s=await a.service.iniciar(a.usuario,i);
  for(const fn of [()=>a.service.consultar({...a.usuario,id:2},s.id),()=>a.service.cancelar({...a.usuario,id:2},s.id),()=>a.service.finalizar({...a.usuario,id:2},s.id),()=>a.service.parte({...a.usuario,id:2},s.id,0,Buffer.alloc(16))])await assert.rejects(fn,{codigo:"UPLOAD_NAO_ENCONTRADO"});
  await assert.rejects(a.service.iniciar(a.usuario,{...i,arquivo:{...i.arquivo,tamanho:i.arquivo.tamanho+1}}),{codigo:"UPLOAD_DADOS_ALTERADOS"});
  await assert.rejects(a.service.iniciar(a.usuario,a.inicio(4*1024**3)),{codigo:"ARQUIVO_MUITO_GRANDE"});
  await assert.rejects(a.service.iniciar(a.usuario,{...i,arquivo:{...i.arquivo,mime:"image/png"}}),{codigo:"TIPO_ARQUIVO_INVALIDO"});
  await assert.rejects(a.service.parte(a.usuario,s.id,0,Buffer.alloc(CHUNK_BYTES)),{codigo:"TIPO_ARQUIVO_INVALIDO"});
  a.proibir();await assert.rejects(a.service.consultar(a.usuario,s.id),{codigo:"SEM_PERMISSAO_PASTA"});
});
test("expiracao, cancelamento, limpeza e conclusao perdida preservam o ID reservado",async()=>{
  const a=ambiente(),i=a.inicio(16),s=await a.service.iniciar(a.usuario,i);
  a.expirar();await assert.rejects(a.service.consultar(a.usuario,s.id),{codigo:"UPLOAD_EXPIRADO"});
  await a.service.cancelar(a.usuario,s.id);await assert.rejects(a.service.consultar(a.usuario,s.id),{codigo:"UPLOAD_CANCELADO"});
  const b=ambiente(),j=b.inicio(16),v=await b.service.iniciar(b.usuario,j);
  await b.service.parte(b.usuario,v.id,0,b.prefixo);b.expirar();
  assert.equal((await b.service.finalizar(b.usuario,v.id)).materialId,77);
  const c=ambiente(),k=await c.service.iniciar(c.usuario,c.inicio());c.relogio(86400001);
  await assert.rejects(c.service.consultar(c.usuario,k.id),{codigo:"UPLOAD_EXPIRADO"});
  await c.service.limparAbandonados();assert.equal(c.linhas.get(k.id).estado,"cancelado");
});

test("monitor de limpeza adia concorrencia esperada, sem ocultar falha SQL",async t=>{
  let tick,intervalo,falha={codigo:"GOOGLE_DRIVE_OPERACAO_CONCORRENTE"};
  const avisos=[],adiamentos=[];
  t.mock.method(global,"setInterval",(fn,ms)=>{tick=fn;intervalo=ms;return {unref(){}};});
  const service=criarUploadRetomavelService({repository:{},provider:{},
    gestao:{comTravaUpload:async()=>{throw falha;}},integracaoService:{},
    configuracao:{googleDrive:{},seguranca:{}},
    logger:{debug:msg=>adiamentos.push(msg),warn:(dados,msg)=>avisos.push({dados,msg})}});
  service.iniciarLimpeza();assert.equal(intervalo,65000);
  tick();await new Promise(setImmediate);
  assert.equal(adiamentos.length,1);assert.equal(avisos.length,0);
  falha={code:"ER_PARSE_ERROR",message:"conteudo privado que nao deve aparecer"};
  tick();await new Promise(setImmediate);
  assert.equal(avisos.length,1);assert.equal(avisos[0].dados.codigo,"ER_PARSE_ERROR");
  assert.equal(JSON.stringify(avisos).includes("conteudo privado"),false);
});
