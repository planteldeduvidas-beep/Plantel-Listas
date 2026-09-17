const test=require("node:test");
const assert=require("node:assert/strict");
const criarGestaoRepository=require("../src/modules/materiais/gestaoMateriaisRepository");
const criarChangesRepository=require("../src/modules/materiais/googleDriveChangesRepository");

function dadosMaterial(){return{driveFileId:"drive-1",driveParentFileId:"pasta-1",categoriaId:1,disciplinaId:null,concursoId:null,nome:"arquivo.pdf",mimeType:"application/pdf",tipo:"pdf",extensao:"pdf",tamanhoBytes:10,checksumMd5:null,driveCriadoEm:null,driveModificadoEm:null,resourceKey:null};}

test("material le o retorno dentro da transacao e nao executa SELECT depois do COMMIT",async function(){
  const ordem=[];
  const conexao={beginTransaction:async()=>ordem.push("begin"),commit:async()=>ordem.push("commit"),rollback:async()=>ordem.push("rollback"),release:()=>ordem.push("release"),execute:async function(sql){
    if(sql.startsWith("INSERT INTO materiais")){ordem.push("insert");return[{insertId:7}];}
    if(sql.startsWith("INSERT INTO auditoria_materiais")){ordem.push("audit");return[{affectedRows:1}];}
    if(sql.startsWith("SELECT m.*")){ordem.push("select");return[[{id:7,drive_file_id:"drive-1",drive_parent_file_id:"pasta-1",categoria_id:1,categoria_drive_id:"pasta-1",nome:"arquivo.pdf",mime_type:"application/pdf",tipo:"pdf",extensao:"pdf",tamanho_bytes:10,disciplina_id:null,concurso_id:null,estado_gestao:"disponivel",categoria_anterior_id:null,versao:1}]];}
    throw new Error("SQL inesperado: "+sql);
  }};
  const repository=criarGestaoRepository({getConnection:async()=>conexao});
  const material=await repository.criarMaterial(dadosMaterial(),2,null);
  assert.equal(material.id,7);
  assert.deepEqual(ordem,["begin","insert","audit","select","commit","release"]);
});

test("falha do COMMIT e marcada como resultado desconhecido e nao tenta rollback enganoso",async function(){
  let rollback=0;
  const conexao={beginTransaction:async()=>{},commit:async()=>{throw new Error("conexao perdida no commit");},rollback:async()=>{rollback+=1;},release:()=>{},execute:async function(sql){
    if(sql.startsWith("INSERT INTO materiais"))return[{insertId:7}];
    if(sql.startsWith("INSERT INTO auditoria_materiais"))return[{affectedRows:1}];
    if(sql.startsWith("SELECT m.*"))return[[{id:7,drive_file_id:"drive-1",drive_parent_file_id:"pasta-1",categoria_id:1,categoria_drive_id:"pasta-1",nome:"arquivo.pdf",mime_type:"application/pdf",tipo:"pdf",extensao:"pdf",tamanho_bytes:10,disciplina_id:null,concurso_id:null,estado_gestao:"disponivel",categoria_anterior_id:null,versao:1}]];
    throw new Error("SQL inesperado");
  }};
  const repository=criarGestaoRepository({getConnection:async()=>conexao});
  await assert.rejects(repository.criarMaterial(dadosMaterial(),2,null),function(erro){return erro.estadoCommit==="desconhecido";});
  assert.equal(rollback,0);
});

test("exclusao pendente e operacao duravel sao confirmadas na mesma transacao",async function(){
  const ordem=[];
  const conexao={beginTransaction:async()=>ordem.push("begin"),commit:async()=>ordem.push("commit"),rollback:async()=>ordem.push("rollback"),release:()=>ordem.push("release"),execute:async function(sql){
    if(sql.startsWith("UPDATE materiais SET estado_gestao='exclusao_pendente'")){ordem.push("material");return[{affectedRows:1}];}
    if(sql.startsWith("INSERT INTO auditoria_materiais")){ordem.push("audit");return[{affectedRows:1}];}
    if(sql.startsWith("INSERT INTO operacoes_google_drive_pendentes")){ordem.push("journal");return[{insertId:9}];}
    if(sql.startsWith("SELECT m.*")){ordem.push("select");return[[{id:7,drive_file_id:"drive-1",drive_parent_file_id:"pasta-1",categoria_id:1,categoria_drive_id:"pasta-1",nome:"arquivo.pdf",mime_type:"application/pdf",tipo:"pdf",extensao:"pdf",tamanho_bytes:10,disciplina_id:null,concurso_id:null,estado_gestao:"exclusao_pendente",categoria_anterior_id:1,versao:2}]];}
    throw new Error("SQL inesperado: "+sql);
  }};
  const repository=criarGestaoRepository({getConnection:async()=>conexao});
  await repository.marcarExclusao(7,1,2,{chave:"11111111-1111-4111-8111-111111111111",detalhes:{driveFileId:"drive-1"}});
  assert.deepEqual(ordem,["begin","material","audit","journal","select","commit","release"]);
});

test("falha em GET_LOCK libera a conexao reservada",async function(){
  let liberacoes=0;
  const repository=criarChangesRepository({getConnection:async()=>({execute:async()=>{throw new Error("falha get lock");},release:()=>{liberacoes+=1;}})});
  await assert.rejects(repository.adquirirTrava(),/falha get lock/);
  assert.equal(liberacoes,1);
});
