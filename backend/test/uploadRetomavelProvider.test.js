const test = require("node:test");
const assert = require("node:assert/strict");
const {criarGoogleDriveProvider} = require("../src/shared/providers/googleDriveProvider");
class OAuth {setCredentials(){} async getAccessToken(){return {token:"fake"};}}
function provider(fetch) {return criarGoogleDriveProvider({clientId:"fake",clientSecret:"fake",redirectUri:"http://localhost/callback",pastaRaizId:"raizTeste12345"},{OAuth2Client:OAuth,fetch});}
const url="https://www.googleapis.com/upload/drive/v3/files?upload_id=teste";
test("protocolo: Range e offset confirmados, 308 sem redirect, finalizacao e URI restrita",async()=>{
  let resposta=new Response(null,{status:308,headers:{Range:"bytes=0-262143"}});
  let req;
  const p=provider(async(u,o)=>{req=o;return resposta;});
  assert.deepEqual(await p.transferirParteUpload("fake",url,500000),{completo:false,recebido:262144});
  assert.equal(req.redirect,"manual");assert.equal(req.headers["Content-Range"],"bytes */500000");
  resposta=new Response(null,{status:308});
  assert.equal((await p.transferirParteUpload("fake",url,500000,0,Buffer.alloc(262144))).recebido,0);
  assert.equal(req.headers["Content-Range"],"bytes 0-262143/500000");
  resposta=Response.json({id:"arquivo"},{status:201});
  assert.equal((await p.transferirParteUpload("fake",url,500000)).completo,true);
  await assert.rejects(p.transferirParteUpload("fake","https://outro.test/upload",500000));
});
test("falhas 401/403/404/400/429/5xx e timeout nao vazam resposta ou URL",async()=>{
  for(const [status,codigo] of [[401,"GOOGLE_AUTORIZACAO_INVALIDA"],[403,"GOOGLE_ACESSO_NEGADO"],[404,"UPLOAD_EXPIRADO"],[400,"UPLOAD_SESSAO_REJEITADA"],[429,"GOOGLE_LIMITE_EXCEDIDO"],[503,"GOOGLE_DRIVE_INDISPONIVEL"]]){
    const p=provider(async()=>new Response("segredo interno",{status}));
    await assert.rejects(p.transferirParteUpload("fake",url,500000),e=>{assert.equal(e.codigo,codigo);assert.ok(!e.message.includes("segredo"));return true;});
  }
  await assert.rejects(provider(async()=>{throw new Error(url);}).transferirParteUpload("fake",url,500000),{codigo:"UPLOAD_INTERROMPIDO"});
  await assert.rejects(provider(async()=>new Response(null,{status:308,headers:{range:"bytes=0-600000"}})).transferirParteUpload("fake",url,500000),{codigo:"UPLOAD_PROTOCOLO_INVALIDO"});
});
