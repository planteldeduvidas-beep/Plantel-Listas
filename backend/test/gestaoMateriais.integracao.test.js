const test=require("node:test");
const assert=require("node:assert/strict");
const request=require("supertest");
const pino=require("pino");
const criarAplicacao=require("../src/app");
const {obterConfiguracao}=require("../src/shared/config/ambiente");
const {criarPool}=require("../src/shared/database/conexao");
const {criarEmailProviderFake}=require("../src/shared/providers/emailProvider");
const {criarHashDaSenha}=require("../src/modules/autenticacao/senha");
const {ESCOPO_LEITURA,ESCOPO_GESTAO}=require("../src/shared/providers/googleDriveProvider");
const criarChangesRepository=require("../src/modules/materiais/googleDriveChangesRepository");

const base=obterConfiguracao();
const configuracao=Object.assign({},base,{ambiente:"test",nivelDeLog:"silent",banco:Object.assign({},base.banco,{nome:process.env.DB_TEST_NAME||base.banco.nome+"_test"}),googleDrive:{clientId:"fase6.apps.googleusercontent.com",clientSecret:"segredo-fase6",pastaRaizId:"pastaRaizFaseSeis123",redirectUri:"http://localhost:3000/api/integracoes/google-drive/oauth/callback",refreshToken:"refresh-token-fase-seis",webhookUrl:"",intervaloChangesMs:60000,escopo:"https://www.googleapis.com/auth/drive"}});
configuracao.seguranca=Object.assign({},base.seguranca,{limiteAutenticacao:100,limiteUpload:100});
const pool=criarPool(configuracao.banco);
let sequencia=0;
const operacoes=[];
const itensDrive=new Map();
const provider={
  buscarPastasPorNome:async function(token,pai,nome){return [...itensDrive.values()].filter(item=>item.name===nome && !item.trashed && item.mimeType==='application/vnd.google-apps.folder' && (item.parents||[]).includes(pai));},
  pastaPossuiFilhos:async function(token,id){return [...itensDrive.values()].some(item=>!item.trashed&&(item.parents||[]).includes(id));},
  escopo:ESCOPO_GESTAO,pastaRaizId:configuracao.googleDrive.pastaRaizId,
  obterItem:async function obter(token,id){return itensDrive.get(id)||{id:id,name:"externo",mimeType:"application/vnd.google-apps.folder",parents:["foraDaRaiz"],trashed:false};},
  verificarDescendenteDaRaiz:async function verificar(token,item){if(!item||item.trashed)return false;let atual=item;for(let nivel=0;nivel<10;nivel+=1){if((atual.parents||[]).includes(configuracao.googleDrive.pastaRaizId))return true;atual=itensDrive.get((atual.parents||[])[0]);if(!atual)return false;}return false;},
  criarArquivo:async function criar(token,dados){sequencia+=1;operacoes.push(["criar",dados.pastaDriveId]);const item={id:"driveNovo"+sequencia,name:dados.nome,mimeType:dados.mimeType,size:String(dados.tamanho),parents:[dados.pastaDriveId],trashed:false};itensDrive.set(item.id,item);return item;},
  criarPasta:async function criarPasta(token,nome,pai){sequencia+=1;operacoes.push(["criar-pasta",pai,nome]);const item={id:"drivePastaNova"+sequencia,name:nome,mimeType:"application/vnd.google-apps.folder",parents:[pai],trashed:false};itensDrive.set(item.id,item);return item;},
  renomearArquivo:async function renomear(token,id,nome){operacoes.push(["renomear",id,nome]);const item=itensDrive.get(id);if(item)item.name=nome;return{id:id,name:nome};},
  moverArquivo:async function mover(token,id,origem,destino){operacoes.push(["mover",id,origem,destino]);const item=itensDrive.get(id);if(item)item.parents=[destino];return{id:id,parents:[destino]};},
  alterarLixeira:async function lixeira(token,id,estado){operacoes.push(["lixeira",id,estado]);const item=itensDrive.get(id);if(item)item.trashed=estado;return{id:id,trashed:estado};},
  excluirArquivo:async function excluir(token,id){operacoes.push(["excluir",id]);itensDrive.delete(id);return{};},
  gerarUrlAutorizacao:function gerar(){return"https://google.test";},trocarCodigoPorRefreshToken:async function trocar(){return"refresh-token-fase-seis";},listarArvore:async function listar(){return{raiz:{},pastas:[],arquivos:[]};}
};
configuracao.googleDrive.encryptionKey = "chave-exclusiva-de-teste-upload-32-caracteres";
const app=criarAplicacao(configuracao,pino({level:"silent"}),{pool:pool,emailProvider:criarEmailProviderFake(),googleDriveProvider:provider,agendarTarefaGoogleDrive:function ignorar(){},agendarTarefaGoogleDriveChanges:function ignorar(){}});
let usuarios;let pastaA;let pastaB;let pastaProibida;let materialId;

async function limparCategorias(){let removidas=1;while(removidas){const[r]=await pool.execute("DELETE c FROM categorias c LEFT JOIN categorias f ON f.categoria_pai_id=c.id WHERE f.id IS NULL");removidas=r.affectedRows;}}
async function limpar(){await pool.execute("DELETE FROM professor_disciplinas");await pool.execute("DELETE FROM operacoes_google_drive_pendentes");await pool.execute("DELETE FROM auditoria_materiais");await pool.execute("DELETE FROM auditoria_geral");await pool.execute("DELETE FROM notificacoes_google_drive");await pool.execute("DELETE FROM canais_google_drive");await pool.execute("DELETE FROM estado_changes_google_drive");await pool.execute("DELETE FROM materiais");await pool.execute("DELETE FROM auditoria_classificacao_categorias");await pool.execute("DELETE FROM permissoes_professor_categoria");await limparCategorias();await pool.execute("DELETE FROM disciplinas");await pool.execute("DELETE FROM concursos");await pool.execute("DELETE FROM credenciais_google_drive");await pool.execute("DELETE FROM estados_oauth_google_drive");await pool.execute("DELETE FROM sincronizacoes_google_drive");await pool.execute("DELETE FROM recuperacoes_senha");await pool.execute("DELETE FROM sessoes");await pool.execute("DELETE FROM usuarios");}
async function usuario(email,papel){const[r]=await pool.execute("INSERT INTO usuarios(email,senha_hash,papel)VALUES(?,?,?)",[email,await criarHashDaSenha("Senha-forte-fase-6"),papel]);return{id:Number(r.insertId),email:email,papel:papel};}
async function autenticar(papel){const agente=request.agent(app);const csrf=(await agente.get("/api/autenticacao/csrf")).body.csrfToken;assert.equal((await agente.post("/api/autenticacao/login").set("X-CSRF-Token",csrf).send({email:usuarios[papel].email,senha:"Senha-forte-fase-6"})).status,200);return{agente:agente,csrf:csrf};}

test.beforeEach(async function preparar(){await limpar();operacoes.length=0;itensDrive.clear();itensDrive.set(configuracao.googleDrive.pastaRaizId,{id:configuracao.googleDrive.pastaRaizId,mimeType:"application/vnd.google-apps.folder",parents:[],trashed:false});itensDrive.set("driveAreaA",{id:"driveAreaA",mimeType:"application/vnd.google-apps.folder",parents:[configuracao.googleDrive.pastaRaizId],trashed:false});itensDrive.set("driveAreaB",{id:"driveAreaB",mimeType:"application/vnd.google-apps.folder",parents:["driveAreaA"],trashed:false});itensDrive.set("driveProibida",{id:"driveProibida",mimeType:"application/vnd.google-apps.folder",parents:[configuracao.googleDrive.pastaRaizId],trashed:false});itensDrive.set("driveMaterial6",{id:"driveMaterial6",name:"original.pdf",mimeType:"application/pdf",parents:["driveAreaA"],trashed:false});usuarios={admin:await usuario("admin6@example.com","admin"),professor:await usuario("prof6@example.com","professor"),aluno:await usuario("aluno6@example.com","aluno")};const[a]=await pool.execute("INSERT INTO categorias(nome,drive_pasta_id)VALUES('Area A','driveAreaA')");pastaA=Number(a.insertId);const[b]=await pool.execute("INSERT INTO categorias(nome,categoria_pai_id,drive_pasta_id)VALUES('Subarea B',?,'driveAreaB')",[pastaA]);pastaB=Number(b.insertId);const[p]=await pool.execute("INSERT INTO categorias(nome,drive_pasta_id)VALUES('Proibida','driveProibida')");pastaProibida=Number(p.insertId);await pool.execute("INSERT INTO permissoes_professor_categoria(professor_id,categoria_id,concedida_por_usuario_id)VALUES(?,?,?)",[usuarios.professor.id,pastaA,usuarios.admin.id]);const[m]=await pool.execute("INSERT INTO materiais(drive_file_id,drive_parent_file_id,categoria_id,nome,mime_type,tipo,extensao,tamanho_bytes,disponivel,ultima_sincronizacao_drive_id)VALUES('driveMaterial6','driveAreaA',?,'original.pdf','application/pdf','pdf','pdf',20,1,NULL)",[pastaA]);materialId=Number(m.insertId);});
test.afterEach(async function limparDisciplinasDoProfessor(){await pool.execute("DELETE FROM professor_disciplinas");});

test("Organizacao cria principal e subpasta no Drive com metadados; professor nao cria principal", async function() {
  const admin=await autenticar("admin");
  const raiz=await admin.agente.post("/api/categorias").set("X-CSRF-Token",admin.csrf).send({nome:"Resolucao principal",descricao:"Material resolvido",ordem:4});
  assert.equal(raiz.status,201,JSON.stringify(raiz.body));
  assert.equal(raiz.body.categoria.vinculadaDrive,true);
  assert.equal(raiz.body.categoria.descricao,"Material resolvido");
  assert.equal(raiz.body.categoria.ordem,4);
  const filha=await admin.agente.post("/api/categorias").set("X-CSRF-Token",admin.csrf).send({nome:"Subpasta",categoriaPaiId:raiz.body.categoria.id});
  assert.equal(filha.status,201,JSON.stringify(filha.body));
  const [registros]=await pool.execute("SELECT drive_pasta_id FROM categorias WHERE id=?",[raiz.body.categoria.id]);
  assert.deepEqual(itensDrive.get(registros[0].drive_pasta_id).parents,[provider.pastaRaizId]);
  const destinos=await admin.agente.get("/api/gestao-materiais/pastas");
  assert.ok(destinos.body.some(p=>p.id===filha.body.categoria.id));
  const professor=await autenticar("professor");
  assert.equal((await professor.agente.post("/api/gestao-materiais/pastas").set("X-CSRF-Token",professor.csrf).send({nome:"Proibida",categoriaPaiId:null})).status,403);
  assert.equal((await admin.agente.post("/api/categorias").set("X-CSRF-Token",admin.csrf).send({nome:"Teste",drivePastaId:"injetado"})).status,400);
});

test("vincula legado preservando ID e permissao; repete sem duplicar e recusa ambiguidade", async function() {
  const admin=await autenticar("admin");
  const [criada]=await pool.execute("INSERT INTO categorias(nome) VALUES ('Resolucao legada')");
  const id=Number(criada.insertId);
  await pool.execute("INSERT INTO permissoes_professor_categoria(professor_id,categoria_id,concedida_por_usuario_id)VALUES(?,?,?)",[usuarios.professor.id,id,usuarios.admin.id]);
  const vincular=()=>admin.agente.post(`/api/gestao-materiais/pastas/${id}/vincular-drive`).set("X-CSRF-Token",admin.csrf);
  assert.equal((await admin.agente.post(`/api/gestao-materiais/pastas/${id}/vincular-drive`)).status,403);
  assert.equal((await vincular()).status,200);
  assert.equal((await vincular()).status,200);
  assert.equal(operacoes.filter(op=>op[0]==="criar-pasta").length,1);
  assert.ok((await admin.agente.get("/api/gestao-materiais/pastas")).body.some(p=>p.id===id));
  const [permissoes]=await pool.execute("SELECT id FROM permissoes_professor_categoria WHERE categoria_id=? AND revogada_em IS NULL",[id]);
  assert.equal(permissoes.length,1);
  const [outra]=await pool.execute("INSERT INTO categorias(nome) VALUES ('Ambigua')");
  for(const driveId of ['ambigua1','ambigua2']) itensDrive.set(driveId,{id:driveId,name:'Ambigua',mimeType:'application/vnd.google-apps.folder',parents:[provider.pastaRaizId]});
  const conflito=await admin.agente.post(`/api/gestao-materiais/pastas/${outra.insertId}/vincular-drive`).set("X-CSRF-Token",admin.csrf);
  assert.equal(conflito.status,409);
  assert.equal(conflito.body.erro.codigo,"PASTA_DRIVE_AMBIGUA");
});

test("admin reativa pasta vinculada oculta somente se ainda estiver no mesmo lugar no Drive", async function() {
  const admin=await autenticar("admin");
  const url=`/api/gestao-materiais/pastas/${pastaB}/vincular-drive`;
  await pool.execute("UPDATE categorias SET ativo=0 WHERE id=?",[pastaB]);
  const recuperada=await admin.agente.post(url).set("X-CSRF-Token",admin.csrf);
  assert.equal(recuperada.status,200,JSON.stringify(recuperada.body));
  assert.ok((await admin.agente.get("/api/gestao-materiais/pastas")).body.some(p=>p.id===pastaB));
  const [auditoria]=await pool.execute("SELECT id FROM auditoria_geral WHERE entidade_id=? AND acao='pasta_reativada_drive'",[pastaB]);
  assert.equal(auditoria.length,1);

  await pool.execute("UPDATE categorias SET ativo=0 WHERE id=?",[pastaB]);
  itensDrive.get("driveAreaB").parents=["driveProibida"];
  const movida=await admin.agente.post(url).set("X-CSRF-Token",admin.csrf);
  assert.equal(movida.status,409);
  const [estado]=await pool.execute("SELECT ativo FROM categorias WHERE id=?",[pastaB]);
  assert.equal(Number(estado[0].ativo),0);
});

test("pasta recém-criada e vazia aparece nos destinos e aceita o primeiro upload", async function() {
  const admin = await autenticar("admin");
  const criada = await admin.agente.post("/api/gestao-materiais/pastas").set("X-CSRF-Token", admin.csrf)
    .send({ nome: "Resolução Listas", categoriaPaiId: pastaB });
  assert.equal(criada.status, 201);
  const destinos = await admin.agente.get("/api/gestao-materiais/pastas");
  assert.equal(destinos.status, 200);
  assert.ok(destinos.body.some(p => p.id === criada.body.id && p.caminho.endsWith("Resolução Listas")));
  const professor = await autenticar("professor");
  const permitidas = await professor.agente.get("/api/gestao-materiais/pastas");
  assert.ok(permitidas.body.some(p => p.id === criada.body.id));
  assert.ok(!permitidas.body.some(p => p.id === pastaProibida));
  const enviado = await admin.agente.post("/api/gestao-materiais").set("X-CSRF-Token", admin.csrf)
    .field("categoriaId", String(criada.body.id))
    .attach("arquivo", Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF"), { filename: "lista.pdf", contentType: "application/pdf" });
  assert.equal(enviado.status, 201, JSON.stringify(enviado.body));
});

test("admin exclui pasta vazia aninhada com auditoria e journal; demais papeis protegidos",async function(){
  const admin=await autenticar("admin");
  const criada=await admin.agente.post("/api/gestao-materiais/pastas").set("X-CSRF-Token",admin.csrf).send({nome:"Pasta errada",categoriaPaiId:pastaB});
  assert.equal(criada.status,201,JSON.stringify(criada.body));
  const id=criada.body.id;
  for(const papel of ["professor","aluno"]){
    const pessoa=await autenticar(papel);
    assert.equal((await pessoa.agente.delete("/api/gestao-materiais/pastas/"+id).set("X-CSRF-Token",pessoa.csrf)).status,403);
  }
  assert.equal((await admin.agente.delete("/api/gestao-materiais/pastas/"+id)).status,403);
  const excluida=await admin.agente.delete("/api/gestao-materiais/pastas/"+id).set("X-CSRF-Token",admin.csrf);
  assert.equal(excluida.status,200,JSON.stringify(excluida.body));
  const [pastas]=await pool.execute("SELECT ativo,drive_pasta_id FROM categorias WHERE id=?",[id]);
  assert.equal(Number(pastas[0].ativo),0);
  assert.equal(itensDrive.get(pastas[0].drive_pasta_id).trashed,true);
  const [auditoria]=await pool.execute("SELECT id FROM auditoria_geral WHERE entidade_id=? AND acao='pasta_enviada_lixeira'",[id]);
  assert.equal(auditoria.length,1);
  const [journal]=await pool.execute("SELECT fase FROM operacoes_google_drive_pendentes WHERE tipo='pasta_lixeira'");
  assert.equal(journal[0].fase,"concluida");
  const listagem=await admin.agente.get("/api/acervo?categoriaId="+pastaB);
  assert.equal(listagem.body.pastas.some(pasta=>pasta.id===id),false);
});

test("exclusao de pasta preenchida retira descendentes e leitura direta sem afetar pai ou irma",async function(){
  const admin=await autenticar("admin");
  const sub=await admin.agente.post("/api/gestao-materiais/pastas").set("X-CSRF-Token",admin.csrf).send({nome:"Descendente",categoriaPaiId:pastaB});
  assert.equal(sub.status,201);
  const enviado=await admin.agente.post("/api/gestao-materiais").set("X-CSRF-Token",admin.csrf).field("categoriaId",String(sub.body.id)).attach("arquivo",Buffer.from("%PDF-1.7\nconteudo"),{filename:"filho.pdf",contentType:"application/pdf"});
  assert.equal(enviado.status,201,JSON.stringify(enviado.body));
  const removida=await admin.agente.delete("/api/gestao-materiais/pastas/"+pastaB).set("X-CSRF-Token",admin.csrf);
  assert.equal(removida.status,200,JSON.stringify(removida.body));
  assert.equal(removida.body.pastas,2);
  assert.equal(removida.body.materiais,1);
  const [categorias]=await pool.execute("SELECT id,ativo FROM categorias WHERE id IN (?,?,?,?)",[pastaA,pastaB,sub.body.id,pastaProibida]);
  for(const categoria of categorias) assert.equal(Number(categoria.ativo),[pastaB,sub.body.id].includes(Number(categoria.id))?0:1);
  const [material]=await pool.execute("SELECT disponivel FROM materiais WHERE id=?",[materialId]);
  assert.equal(Number(material[0].disponivel),1);
  const aluno=await autenticar("aluno");
  assert.equal((await aluno.agente.get("/api/acervo/materiais/"+enviado.body.id+"/conteudo")).status,404);
  assert.equal((await aluno.agente.get("/api/acervo/materiais/"+enviado.body.id+"/download")).status,404);
  const [auditoria]=await pool.execute("SELECT contexto FROM auditoria_geral WHERE entidade_id=? AND acao='pasta_enviada_lixeira'",[pastaB]);
  const contexto=typeof auditoria[0].contexto==="string"?JSON.parse(auditoria[0].contexto):auditoria[0].contexto;
  assert.equal(contexto.pastas,2);
  assert.equal(contexto.materiais,1);
});

test("upload multipart do PWA aceita PDF generico com nome sem extensao e rejeita falso PDF",async function(){
  const admin=await autenticar("admin");
  const enviar=(conteudo)=>admin.agente.post("/api/gestao-materiais").set("X-CSRF-Token",admin.csrf)
    .set("User-Agent","Mozilla/5.0 (Linux; Android 14) Chrome/130.0.0.0 Mobile Safari/537.36")
    .field("categoriaId",String(pastaB)).field("nome","Lista do celular").field("disciplinaId","").field("concursoId","")
    .attach("arquivo",Buffer.from(conteudo),{filename:"lista.pdf",contentType:"application/octet-stream"});
  const resposta=await enviar("%PDF-1.7\nconteudo");
  assert.equal(resposta.status,201,JSON.stringify(resposta.body));
  assert.equal(resposta.body.nome,"Lista do celular.pdf");
  assert.equal(resposta.body.categoriaId,pastaB);
  const [gravado]=await pool.execute("SELECT nome FROM materiais WHERE id=?",[resposta.body.id]);
  assert.equal(gravado[0].nome,"Lista do celular.pdf");
  assert.equal((await enviar("nao e pdf")).body.erro.codigo,"TIPO_ARQUIVO_INVALIDO");
});
test.after(async function encerrar(){await limpar();await pool.end();});

test("upload em partes integra permissao, CSRF, Drive fake, MySQL, biblioteca e auditoria unica",async(t)=>{
  const crypto=require("node:crypto");
  await pool.execute("DELETE FROM uploads_retomaveis");
  t.after(async()=>{await pool.execute("DELETE FROM uploads_retomaveis");});
  const sessoes=new Map();
  provider.reservarIdUpload=async()=>"driveUpload"+crypto.randomUUID();
  provider.iniciarUploadRetomavel=async(token,dados)=>{const url="https://www.googleapis.com/upload/drive/v3/files?upload_id="+dados.driveId;sessoes.set(url,{dados,recebido:0});return url;};
  provider.transferirParteUpload=async(token,url,total,offset,corpo)=>{
    const sessao=sessoes.get(url);
    if(corpo){assert.equal(offset,sessao.recebido);sessao.recebido+=corpo.length;}
    const completo=sessao.recebido===total;
    const item={id:sessao.dados.driveId,name:sessao.dados.nome,mimeType:sessao.dados.mimeType,size:String(total),parents:[sessao.dados.pastaDriveId],trashed:false};
    if(completo)itensDrive.set(item.id,item);
    return {completo,recebido:sessao.recebido,item:completo?item:undefined};
  };
  const professor=await autenticar("professor"),admin=await autenticar("admin");
  const prefixo=Buffer.from("0000ftypisom0000");
  const corpo={id:crypto.randomUUID(),campos:{categoriaId:String(pastaB)},arquivo:{nome:"aula.mp4",mime:"video/mp4",tamanho:16,assinatura:prefixo.toString("base64")}};
  assert.equal((await professor.agente.post("/api/uploads").send(corpo)).status,403);
  assert.equal((await professor.agente.post("/api/uploads").set("X-CSRF-Token",professor.csrf).send({...corpo,campos:{categoriaId:String(pastaProibida)}})).status,403);
  const inicio=await professor.agente.post("/api/uploads").set("X-CSRF-Token",professor.csrf).send(corpo);
  assert.equal(inicio.status,201,JSON.stringify(inicio.body));
  assert.equal((await admin.agente.get("/api/uploads/"+corpo.id)).status,404);
  assert.equal((await professor.agente.post(`/api/uploads/${corpo.id}/finalizar`).set("X-CSRF-Token",professor.csrf).send({})).status,409);
  const enviar=()=>professor.agente.put(`/api/uploads/${corpo.id}/partes`).set("X-CSRF-Token",professor.csrf).set("Content-Type","application/octet-stream").set("X-Upload-Offset","0").send(prefixo);
  assert.equal((await enviar()).status,200);
  assert.equal((await enviar()).status,200);
  const [antes]=await pool.execute("SELECT drive_id FROM uploads_retomaveis WHERE id=?",[corpo.id]);
  // O Changes nao pode tornar visivel um arquivo ainda nao finalizado.
  const changes=criarChangesRepository(pool);const con=await pool.getConnection();
  try{await changes.aplicarAlteracoes(con,[{disponivel:true,item:{...itensDrive.get(antes[0].drive_id),parentId:"driveAreaB"}}],"upload-teste");}finally{con.release();}
  const [naoPublicado]=await pool.execute("SELECT id FROM materiais WHERE drive_file_id=?",[antes[0].drive_id]);assert.equal(naoPublicado.length,0);
  const finalizar=()=>professor.agente.post(`/api/uploads/${corpo.id}/finalizar`).set("X-CSRF-Token",professor.csrf).send({});
  const obterConexao=pool.getConnection.bind(pool);
  const mockConexao=t.mock.method(pool,"getConnection",async()=>{
    const c=await obterConexao(),executar=c.execute.bind(c),liberar=c.release.bind(c);
    c.execute=(sql,args)=>String(sql).startsWith("INSERT INTO auditoria_materiais")?Promise.reject(new Error("falha SQL simulada")):executar(sql,args);
    c.release=()=>{c.execute=executar;c.release=liberar;liberar();};return c;
  });
  assert.equal((await finalizar()).status,500);
  mockConexao.mock.restore();
  const [rollback]=await pool.execute("SELECT id FROM materiais WHERE drive_file_id=?",[antes[0].drive_id]);assert.equal(rollback.length,0);
  const [retomavel]=await pool.execute("SELECT estado FROM uploads_retomaveis WHERE id=?",[corpo.id]);assert.equal(retomavel[0].estado,"enviado");
  assert.ok(itensDrive.has(antes[0].drive_id));
  const fim=await finalizar();assert.equal(fim.status,200,JSON.stringify(fim.body));assert.ok(fim.body.materialId);
  assert.equal((await finalizar()).body.materialId,fim.body.materialId);
  const [materiais]=await pool.execute("SELECT categoria_id,tamanho_bytes,drive_file_id FROM materiais WHERE id=?",[fim.body.materialId]);
  assert.equal(Number(materiais[0].categoria_id),pastaB);assert.equal(Number(materiais[0].tamanho_bytes),16);
  assert.deepEqual(itensDrive.get(materiais[0].drive_file_id).parents,["driveAreaB"]);
  const [auditoria]=await pool.execute("SELECT id FROM auditoria_materiais WHERE material_id=? AND operacao='upload'",[fim.body.materialId]);assert.equal(auditoria.length,1);
  const biblioteca=await professor.agente.get("/api/acervo").query({categoriaId:pastaB,busca:"aula"});
  assert.equal(biblioteca.status,200);assert.ok(JSON.stringify(biblioteca.body).includes("aula.mp4"));
});

test("upload valida PDF, video, CSRF, papeis, nomes, raiz e permissao por subarvore",async function(){const professor=await autenticar("professor");const pdf=Buffer.from("%PDF-1.7\nconteudo seguro","utf8");const ok=await professor.agente.post("/api/gestao-materiais").set("X-CSRF-Token",professor.csrf).field("categoriaId",String(pastaB)).attach("arquivo",pdf,{filename:"lista.pdf",contentType:"application/pdf"});assert.equal(ok.status,201);assert.equal(ok.body.nome,"lista.pdf");assert.equal(Object.prototype.hasOwnProperty.call(ok.body,"driveFileId"),false);assert.equal((await professor.agente.post("/api/gestao-materiais").field("categoriaId",String(pastaA)).attach("arquivo",pdf,{filename:"sem-csrf.pdf",contentType:"application/pdf"})).status,403);const proibido=await professor.agente.post("/api/gestao-materiais").set("X-CSRF-Token",professor.csrf).field("categoriaId",String(pastaProibida)).attach("arquivo",pdf,{filename:"lista.pdf",contentType:"application/pdf"});assert.equal(proibido.status,403);const falso=await professor.agente.post("/api/gestao-materiais").set("X-CSRF-Token",professor.csrf).field("categoriaId",String(pastaA)).attach("arquivo",Buffer.from("nao e pdf"),{filename:"falso.pdf",contentType:"application/pdf"});assert.equal(falso.status,400);const nomeInvalido=await professor.agente.post("/api/gestao-materiais").set("X-CSRF-Token",professor.csrf).field("categoriaId",String(pastaA)).field("nome","invalido/arquivo.pdf").attach("arquivo",pdf,{filename:"lista.pdf",contentType:"application/pdf"});assert.equal(nomeInvalido.status,400);const admin=await autenticar("admin");const video=Buffer.concat([Buffer.alloc(4),Buffer.from("ftyp"),Buffer.from("video seguro")]);const videoOk=await admin.agente.post("/api/gestao-materiais").set("X-CSRF-Token",admin.csrf).field("categoriaId",String(pastaProibida)).attach("arquivo",video,{filename:"aula.mp4",contentType:"video/mp4"});assert.equal(videoOk.status,201);assert.equal(videoOk.body.tipo,"video");const[fora]=await pool.execute("INSERT INTO categorias(nome,drive_pasta_id)VALUES('Fora da raiz','driveForaRaiz')");const foraRaiz=await admin.agente.post("/api/gestao-materiais").set("X-CSRF-Token",admin.csrf).field("categoriaId",String(fora.insertId)).attach("arquivo",pdf,{filename:"fora.pdf",contentType:"application/pdf"});assert.equal(foraRaiz.status,403);assert.equal(foraRaiz.body.erro.codigo,"PASTA_FORA_DA_RAIZ");const aluno=await autenticar("aluno");assert.equal((await aluno.agente.post("/api/gestao-materiais").set("X-CSRF-Token",aluno.csrf).field("categoriaId",String(pastaA)).attach("arquivo",pdf,{filename:"aluno.pdf",contentType:"application/pdf"})).status,403);});

test("professor autorizado envia MP4 na subpasta e nao envia fora da permissao", async function() {
  const professor = await autenticar("professor");
  const video = Buffer.concat([Buffer.alloc(4), Buffer.from("ftyp"), Buffer.from("aula de teste")]);
  const resposta = await professor.agente.post("/api/gestao-materiais")
    .set("X-CSRF-Token", professor.csrf)
    .field("categoriaId", String(pastaB))
    .field("nome", "Aula de teste")
    .attach("arquivo", video, { filename: "aula.mp4", contentType: "video/mp4" });
  assert.equal(resposta.status, 201, JSON.stringify(resposta.body));
  assert.equal(resposta.body.tipo, "video");
  assert.equal(resposta.body.categoriaId, pastaB);
  const [materiais] = await pool.execute("SELECT drive_file_id, categoria_id, tipo FROM materiais WHERE id=?", [resposta.body.id]);
  assert.equal(materiais[0].tipo, "video");
  assert.equal(Number(materiais[0].categoria_id), pastaB);
  assert.deepEqual(itensDrive.get(materiais[0].drive_file_id).parents, ["driveAreaB"]);

  const operacoesAntes = operacoes.length;
  const proibido = await professor.agente.post("/api/gestao-materiais")
    .set("X-CSRF-Token", professor.csrf)
    .field("categoriaId", String(pastaProibida))
    .attach("arquivo", video, { filename: "aula.mp4", contentType: "video/mp4" });
  assert.equal(proibido.status, 403);
  assert.equal(proibido.body.erro.codigo, "SEM_PERMISSAO_PASTA");
  assert.equal(operacoes.length, operacoesAntes);
});

test("edicao e movimento protegem mass assignment, concorrencia e IDOR",async function(){const professor=await autenticar("professor");const[disciplina]=await pool.execute("INSERT INTO disciplinas(nome)VALUES('Fisica Fase 6')");await pool.execute("UPDATE categorias SET disciplina_id=?,disciplina_estado='definida',disciplina_origem='manual' WHERE id=?",[disciplina.insertId,pastaB]);const[fora]=await pool.execute("INSERT INTO materiais(drive_file_id,drive_parent_file_id,categoria_id,nome,mime_type,tipo,extensao,disponivel,ultima_sincronizacao_drive_id)VALUES('driveFora6','driveProibida',?,'fora.pdf','application/pdf','pdf','pdf',1,NULL)",[pastaProibida]);assert.equal((await professor.agente.patch("/api/gestao-materiais/"+Number(fora.insertId)).set("X-CSRF-Token",professor.csrf).send({nome:"invasao.pdf",versao:1})).status,403);const editado=await professor.agente.patch("/api/gestao-materiais/"+materialId).set("X-CSRF-Token",professor.csrf).send({nome:"renomeado.pdf",versao:1});assert.equal(editado.status,200,JSON.stringify(editado.body));assert.equal(editado.body.versao,2);const excesso=await professor.agente.patch("/api/gestao-materiais/"+materialId).set("X-CSRF-Token",professor.csrf).send({driveFileId:"forjado",versao:2});assert.equal(excesso.status,400);const destinoProibido=await professor.agente.patch("/api/gestao-materiais/"+materialId+"/mover").set("X-CSRF-Token",professor.csrf).send({categoriaId:pastaProibida,versao:2});assert.equal(destinoProibido.status,403);const movido=await professor.agente.patch("/api/gestao-materiais/"+materialId+"/mover").set("X-CSRF-Token",professor.csrf).send({categoriaId:pastaB,versao:2});assert.equal(movido.status,200,JSON.stringify(movido.body));assert.equal(movido.body.categoriaId,pastaB);const aluno=await autenticar("aluno");const consulta=await aluno.agente.get("/api/acervo?busca=renomeado&disciplinaId="+disciplina.insertId);assert.equal(consulta.status,200);assert.equal(consulta.body.materiais[0].id,materialId);assert.match(consulta.body.materiais[0].caminho,/Subarea B/);const concorrente=await professor.agente.patch("/api/gestao-materiais/"+materialId).set("X-CSRF-Token",professor.csrf).send({nome:"atrasado.pdf",versao:2});assert.equal(concorrente.status,409);});

test("trava compartilhada impede operacao local durante sync ou Changes API",async function(){const professor=await autenticar("professor");const conexao=await pool.getConnection();try{const[trava]=await conexao.execute("SELECT GET_LOCK(LEFT(CONCAT('plantel_drive_operacao_',DATABASE()),64),0) AS adquirida");assert.equal(Number(trava[0].adquirida),1);const antes=operacoes.length;const resposta=await professor.agente.patch("/api/gestao-materiais/"+materialId).set("X-CSRF-Token",professor.csrf).send({nome:"nao-deve-chegar-ao-drive.pdf",versao:1});assert.equal(resposta.status,409);assert.equal(resposta.body.erro.codigo,"GOOGLE_DRIVE_OPERACAO_CONCORRENTE");assert.equal(operacoes.length,antes);}finally{await conexao.execute("SELECT RELEASE_LOCK(LEFT(CONCAT('plantel_drive_operacao_',DATABASE()),64))");conexao.release();}});

test("substituicao valida tipos, preserva materialId e lixeira bloqueia leitura",async function(){const professor=await autenticar("professor");const excesso=await professor.agente.post("/api/gestao-materiais/"+materialId+"/substituir").set("X-CSRF-Token",professor.csrf).field("versao","1").field("driveFileId","forjado").attach("arquivo",Buffer.from("%PDF-1.7\nnovo"),{filename:"novo.pdf",contentType:"application/pdf"});assert.equal(excesso.status,400);const proibido=await professor.agente.post("/api/gestao-materiais/"+materialId+"/substituir").set("X-CSRF-Token",professor.csrf).field("versao","1").attach("arquivo",Buffer.from([0x89,0x50,0x4e,0x47]),{filename:"imagem.png",contentType:"image/png"});assert.equal(proibido.status,400);const novo=await professor.agente.post("/api/gestao-materiais/"+materialId+"/substituir").set("X-CSRF-Token",professor.csrf).field("versao","1").attach("arquivo",Buffer.from("%PDF-1.7\nnovo"),{filename:"novo.pdf",contentType:"application/pdf"});assert.equal(novo.status,200);assert.equal(novo.body.id,materialId);const video=Buffer.concat([Buffer.alloc(4),Buffer.from("ftyp"),Buffer.from("substituto")]);const novoVideo=await professor.agente.post("/api/gestao-materiais/"+materialId+"/substituir").set("X-CSRF-Token",professor.csrf).field("versao","2").attach("arquivo",video,{filename:"novo.mp4",contentType:"video/mp4"});assert.equal(novoVideo.status,200);assert.equal(novoVideo.body.id,materialId);assert.equal(novoVideo.body.tipo,"video");const lixo=await professor.agente.post("/api/gestao-materiais/"+materialId+"/lixeira").set("X-CSRF-Token",professor.csrf).send({versao:3});assert.equal(lixo.status,200);const aluno=await autenticar("aluno");assert.equal((await aluno.agente.get("/api/acervo/materiais/"+materialId+"/download")).status,404);const consulta=await aluno.agente.get("/api/acervo?busca=original");assert.equal(consulta.body.paginacao.totalItens,0);});

test("somente admin restaura e exclui definitivamente arquivo temporario",async function(){const professor=await autenticar("professor");const[fora]=await pool.execute("INSERT INTO materiais(drive_file_id,drive_parent_file_id,categoria_id,nome,mime_type,tipo,extensao,disponivel,ultima_sincronizacao_drive_id)VALUES('driveLixoFora6','driveProibida',?,'fora-lixeira.pdf','application/pdf','pdf','pdf',1,NULL)",[pastaProibida]);assert.equal((await professor.agente.post("/api/gestao-materiais/"+Number(fora.insertId)+"/lixeira").set("X-CSRF-Token",professor.csrf).send({versao:1})).status,403);await professor.agente.post("/api/gestao-materiais/"+materialId+"/lixeira").set("X-CSRF-Token",professor.csrf).send({versao:1});assert.equal((await professor.agente.get("/api/gestao-materiais/lixeira")).status,403);const aluno=await autenticar("aluno");assert.equal((await aluno.agente.post("/api/gestao-materiais/"+materialId+"/lixeira").set("X-CSRF-Token",aluno.csrf).send({versao:2})).status,403);const admin=await autenticar("admin");const lista=await admin.agente.get("/api/gestao-materiais/lixeira");assert.equal(lista.status,200);assert.equal(lista.body[0].id,materialId);const restaurado=await admin.agente.post("/api/gestao-materiais/"+materialId+"/restaurar").set("X-CSRF-Token",admin.csrf).send({versao:2});assert.equal(restaurado.status,200);await admin.agente.post("/api/gestao-materiais/"+materialId+"/lixeira").set("X-CSRF-Token",admin.csrf).send({versao:3});const excluido=await admin.agente.delete("/api/gestao-materiais/"+materialId).set("X-CSRF-Token",admin.csrf).send({versao:4});assert.equal(excluido.status,200);const[estado]=await pool.execute("SELECT estado_gestao,disponivel FROM materiais WHERE id=?",[materialId]);assert.equal(estado[0].estado_gestao,"excluido");assert.equal(Number(estado[0].disponivel),0);});

test("escopo somente leitura exige reconexao antes de qualquer escrita",async function(){const professor=await autenticar("professor");provider.escopo=ESCOPO_LEITURA;try{const resposta=await professor.agente.post("/api/gestao-materiais").set("X-CSRF-Token",professor.csrf).field("categoriaId",String(pastaA)).attach("arquivo",Buffer.from("%PDF-1.7\nseguro"),{filename:"bloqueado.pdf",contentType:"application/pdf"});assert.equal(resposta.status,409);assert.equal(resposta.body.erro.codigo,"GOOGLE_RECONEXAO_ESCRITA_NECESSARIA");assert.equal(operacoes.length,0);}finally{provider.escopo=ESCOPO_GESTAO;}});

test("notificacao posterior permanece idempotente e nao retira material da lixeira",async function(){await pool.execute("UPDATE materiais SET estado_gestao='lixeira',disponivel=0,categoria_anterior_id=categoria_id WHERE id=?",[materialId]);const repository=criarChangesRepository(pool);const conexao=await pool.getConnection();try{await repository.aplicarAlteracoes(conexao,[{disponivel:true,item:{id:"driveMaterial6",parentId:"driveAreaA",name:"original.pdf",mimeType:"application/pdf",size:"20"}}],"pagina-depois-da-escrita");}finally{conexao.release();}const[estado]=await pool.execute("SELECT estado_gestao,disponivel FROM materiais WHERE id=?",[materialId]);assert.equal(estado[0].estado_gestao,"lixeira");assert.equal(Number(estado[0].disponivel),0);});

test("disciplina autoriza todos os ramos classificados, criacao e renomeacao de pastas",async function(){
  const [matematica]=await pool.execute("INSERT INTO disciplinas(nome) VALUES ('Matematica teste')");
  const [fisica]=await pool.execute("INSERT INTO disciplinas(nome) VALUES ('Fisica teste')");
  await pool.execute("UPDATE categorias SET disciplina_id=?,disciplina_estado='definida',disciplina_origem='manual' WHERE id=?",[matematica.insertId,pastaA]);
  await pool.execute("UPDATE categorias SET disciplina_id=?,disciplina_estado='definida',disciplina_origem='manual' WHERE id=?",[fisica.insertId,pastaProibida]);
  itensDrive.set("driveAreaC",{id:"driveAreaC",name:"MAT",mimeType:"application/vnd.google-apps.folder",parents:[configuracao.googleDrive.pastaRaizId],trashed:false});
  const [outroRamo]=await pool.execute("INSERT INTO categorias(nome,drive_pasta_id,disciplina_id,disciplina_estado,disciplina_origem) VALUES ('Ramo sem nome da materia','driveAreaC',?,'definida','manual')",[matematica.insertId]);
  const [excecao]=await pool.execute("INSERT INTO categorias(nome,categoria_pai_id,drive_pasta_id,disciplina_estado) VALUES ('Outro tema',?,'driveNaoSeAplica','nao_se_aplica')",[pastaA]);
  await pool.execute("UPDATE permissoes_professor_categoria SET revogada_em=CURRENT_TIMESTAMP(3),revogada_por_usuario_id=? WHERE professor_id=?",[usuarios.admin.id,usuarios.professor.id]);
  const admin=await autenticar("admin");
  const salvar=await admin.agente.put("/api/permissoes/professores/"+usuarios.professor.id).set("X-CSRF-Token",admin.csrf).send({categoriaIds:[],disciplinaIds:[Number(matematica.insertId)]});
  assert.equal(salvar.status,200,JSON.stringify(salvar.body));
  const professor=await autenticar("professor");
  const pastas=await professor.agente.get("/api/gestao-materiais/pastas");
  assert.equal(pastas.status,200);
  assert.equal(pastas.body.some(p=>p.id===pastaA),true);
  assert.equal(pastas.body.some(p=>p.id===pastaB),true);
  assert.equal(pastas.body.some(p=>p.id===Number(outroRamo.insertId)),true);
  assert.equal(pastas.body.some(p=>p.id===Number(excecao.insertId)),false);
  assert.equal(pastas.body.some(p=>p.id===pastaProibida),false);
  const nova=await professor.agente.post("/api/gestao-materiais/pastas").set("X-CSRF-Token",professor.csrf).send({nome:"Lista 01",categoriaPaiId:pastaB});
  assert.equal(nova.status,201,JSON.stringify(nova.body));
  const [criada]=await pool.execute("SELECT drive_pasta_id,disciplina_estado FROM categorias WHERE id=?",[nova.body.id]);
  assert.equal(criada[0].disciplina_estado,"herdar");
  assert.ok(itensDrive.has(criada[0].drive_pasta_id));
  const renomeada=await professor.agente.patch("/api/gestao-materiais/pastas/"+pastaB+"/nome").set("X-CSRF-Token",professor.csrf).send({nome:"Materiais 2027"});
  assert.equal(renomeada.status,200,JSON.stringify(renomeada.body));
  assert.equal(itensDrive.get("driveAreaB").name,"Materiais 2027");
  assert.equal((await professor.agente.patch("/api/gestao-materiais/pastas/"+nova.body.id+"/nome").set("X-CSRF-Token",professor.csrf).send({nome:"Revisão"})).status,200);
  assert.equal((await professor.agente.patch("/api/gestao-materiais/pastas/"+pastaProibida+"/nome").set("X-CSRF-Token",professor.csrf).send({nome:"Invadida"})).status,403);
  assert.equal((await professor.agente.post("/api/gestao-materiais/pastas").set("X-CSRF-Token",professor.csrf).send({nome:"Invadida",categoriaPaiId:pastaProibida})).status,403);
  const [raiz]=await pool.execute("INSERT INTO categorias(nome,drive_pasta_id) VALUES ('Raiz protegida',?)",[configuracao.googleDrive.pastaRaizId]);
  assert.equal((await admin.agente.patch("/api/gestao-materiais/pastas/"+raiz.insertId+"/nome").set("X-CSRF-Token",admin.csrf).send({nome:"Raiz alterada"})).status,403);
  const [auditorias]=await pool.execute("SELECT acao FROM auditoria_geral WHERE entidade='pasta' AND entidade_id IN (?,?)",[pastaB,nova.body.id]);
  assert.ok(auditorias.some(item=>item.acao==="pasta_criada"));
  assert.ok(auditorias.some(item=>item.acao==="pasta_renomeada"));
});
