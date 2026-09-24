const test=require("node:test");
const assert=require("node:assert/strict");
const pino=require("pino");
const {obterConfiguracao}=require("../src/shared/config/ambiente");
const {criarPool}=require("../src/shared/database/conexao");
const criarUsuarioRepository=require("../src/modules/usuarios/usuarioRepository");
const criarUsuarioService=require("../src/modules/usuarios/usuarioService");
const criarAutenticacaoRepository=require("../src/modules/autenticacao/autenticacaoRepository");
const criarAuditoriaRepository=require("../src/modules/auditoria/auditoriaRepository");
const criarPermissaoRepository=require("../src/modules/permissoes/permissaoRepository");
const criarPermissaoService=require("../src/modules/permissoes/permissaoService");
const criarEstruturaRepository=require("../src/modules/categorias/estruturaAcervoRepository");
const criarEstruturaService=require("../src/modules/categorias/estruturaAcervoService");
const {criarHashDaSenha}=require("../src/modules/autenticacao/senha");
const {gerarHashDoToken}=require("../src/shared/utils/tokens");

const base=obterConfiguracao();
const pool=criarPool(Object.assign({},base.banco,{nome:process.env.DB_TEST_NAME||base.banco.nome+"_test"}));
const logger=pino({level:"silent"});

async function limparCategorias(){let removidas=1;while(removidas){const[r]=await pool.execute("DELETE c FROM categorias c LEFT JOIN categorias f ON f.categoria_pai_id=c.id WHERE f.id IS NULL");removidas=r.affectedRows;}}
async function limpar(){await pool.execute("DELETE FROM operacoes_google_drive_pendentes");await pool.execute("DELETE FROM auditoria_geral");await pool.execute("DELETE FROM permissoes_professor_categoria");await pool.execute("DELETE FROM materiais");await limparCategorias();await pool.execute("DELETE FROM recuperacoes_senha");await pool.execute("DELETE FROM sessoes");await pool.execute("DELETE FROM usuarios");}

test.beforeEach(limpar);
test.after(async function(){await limpar();await pool.end();});

test("falha da auditoria desfaz criacao e edicao administrativa de usuario",async function(){
  const senha=await criarHashDaSenha("Senha-segura-auditoria");
  const[adminR]=await pool.execute("INSERT INTO usuarios(nome,email,senha_hash,papel) VALUES ('Admin','admin-auditoria@example.com',?,'admin')",[senha]);
  const[alunoR]=await pool.execute("INSERT INTO usuarios(nome,email,senha_hash,papel) VALUES ('Aluno','aluno-auditoria@example.com',?,'aluno')",[senha]);
  const usuarios=criarUsuarioRepository(pool);
  const service=criarUsuarioService({usuarioRepository:usuarios,autenticacaoRepository:criarAutenticacaoRepository(pool),logger:logger,auditoriaRepository:{registrar:async function(){throw new Error("FALHA_AUDITORIA_TESTE");}},autenticacaoService:{}});
  const admin={id:Number(adminR.insertId),papel:"admin"};
  await assert.rejects(service.criarUsuario(admin,{nome:"Nova pessoa",email:"nova-auditoria@example.com",senha:"Senha-segura-nova",papel:"professor"}),/FALHA_AUDITORIA_TESTE/);
  const[criados]=await pool.execute("SELECT id FROM usuarios WHERE email='nova-auditoria@example.com'");
  assert.equal(criados.length,0);
  await assert.rejects(service.editarUsuario(admin,Number(alunoR.insertId),{nome:"Nome alterado",email:"alterado-auditoria@example.com"}),/FALHA_AUDITORIA_TESTE/);
  const[originais]=await pool.execute("SELECT nome,email FROM usuarios WHERE id=?",[alunoR.insertId]);
  assert.equal(originais[0].nome,"Aluno");
  assert.equal(originais[0].email,"aluno-auditoria@example.com");
});

test("falha da auditoria desfaz revogacao de permissao",async function(){
  const senha=await criarHashDaSenha("Senha-segura-revogacao");
  const[adminR]=await pool.execute("INSERT INTO usuarios(nome,email,senha_hash,papel) VALUES ('Admin','admin-revogacao@example.com',?,'admin')",[senha]);
  const[profR]=await pool.execute("INSERT INTO usuarios(nome,email,senha_hash,papel) VALUES ('Professor','prof-revogacao@example.com',?,'professor')",[senha]);
  const[catR]=await pool.execute("INSERT INTO categorias(nome) VALUES ('Categoria revogacao')");
  const[permissaoR]=await pool.execute("INSERT INTO permissoes_professor_categoria(professor_id,categoria_id,concedida_por_usuario_id) VALUES (?,?,?)",[profR.insertId,catR.insertId,adminR.insertId]);
  const service=criarPermissaoService({repository:criarPermissaoRepository(pool),usuarioRepository:criarUsuarioRepository(pool),estruturaRepository:criarEstruturaRepository(pool),auditoriaRepository:{registrar:async function(){throw new Error("FALHA_AUDITORIA_TESTE");}}});
  await assert.rejects(service.revogar(Number(permissaoR.insertId),{id:Number(adminR.insertId),papel:"admin"}),/FALHA_AUDITORIA_TESTE/);
  const[registros]=await pool.execute("SELECT revogada_em FROM permissoes_professor_categoria WHERE id=?",[permissaoR.insertId]);
  assert.equal(registros[0].revogada_em,null);
});

test("falha ao criar novo token de recuperacao preserva o token anterior",async function(){
  const senha=await criarHashDaSenha("Senha-segura-recuperacao");
  const[usuarioR]=await pool.execute("INSERT INTO usuarios(nome,email,senha_hash,papel) VALUES ('Aluno','aluno-recuperacao@example.com',?,'aluno')",[senha]);
  const tokenHash=gerarHashDoToken("token-recuperacao-duplicado");
  await pool.execute("INSERT INTO recuperacoes_senha(usuario_id,token_hash,expira_em) VALUES (?,?,DATE_ADD(CURRENT_TIMESTAMP(3),INTERVAL 10 MINUTE))",[usuarioR.insertId,tokenHash]);
  await assert.rejects(criarAutenticacaoRepository(pool).criarRecuperacaoSenha(Number(usuarioR.insertId),tokenHash,new Date(Date.now()+600000)),function(erro){return erro.code==="ER_DUP_ENTRY";});
  const[registros]=await pool.execute("SELECT usada_em FROM recuperacoes_senha WHERE token_hash=?",[tokenHash]);
  assert.equal(registros[0].usada_em,null);
});

test("alteracao concorrente de papel e concessao nunca deixa permissao ativa invalida",async function(){
  const senha=await criarHashDaSenha("Senha-segura-concorrencia");
  const[adminR]=await pool.execute("INSERT INTO usuarios(nome,email,senha_hash,papel) VALUES ('Admin','admin-concorrencia@example.com',?,'admin')",[senha]);
  const[profR]=await pool.execute("INSERT INTO usuarios(nome,email,senha_hash,papel) VALUES ('Professor','prof-concorrencia@example.com',?,'professor')",[senha]);
  const[catR]=await pool.execute("INSERT INTO categorias(nome) VALUES ('Categoria concorrente')");
  const admin={id:Number(adminR.insertId),papel:"admin"};const professorId=Number(profR.insertId);const categoriaId=Number(catR.insertId);
  const usuarios=criarUsuarioRepository(pool);const autenticacao=criarAutenticacaoRepository(pool);const auditoria=criarAuditoriaRepository(pool);const estrutura=criarEstruturaRepository(pool);
  const usuarioService=criarUsuarioService({usuarioRepository:usuarios,autenticacaoRepository:autenticacao,logger:logger,auditoriaRepository:auditoria,autenticacaoService:{}});
  const permissaoService=criarPermissaoService({repository:criarPermissaoRepository(pool),usuarioRepository:usuarios,estruturaRepository:estrutura,auditoriaRepository:auditoria});
  await Promise.allSettled([
    usuarioService.alterarPapel(admin,professorId,{papel:"aluno"}),
    permissaoService.conceder({professorId:professorId,categoriaId:categoriaId},admin)
  ]);
  const[[usuario]]=await pool.execute("SELECT papel FROM usuarios WHERE id=?",[professorId]);
  const[[permissoes]]=await pool.execute("SELECT COUNT(*) quantidade FROM permissoes_professor_categoria WHERE professor_id=? AND revogada_em IS NULL",[professorId]);
  assert.equal(usuario.papel,"aluno");assert.equal(Number(permissoes.quantidade),0);
});

test("login concorrente com redefinicao nao mantem sessao baseada na senha antiga",async function(){
  const senhaAntiga=await criarHashDaSenha("Senha-antiga-concorrente");const senhaNova=await criarHashDaSenha("Senha-nova-concorrente");
  const[u]=await pool.execute("INSERT INTO usuarios(nome,email,senha_hash,papel) VALUES ('Aluno','login-concorrente@example.com',?,'aluno')",[senhaAntiga]);const usuarioId=Number(u.insertId);
  const tokenHash=gerarHashDoToken("token-recuperacao-concorrente");
  await pool.execute("INSERT INTO recuperacoes_senha(usuario_id,token_hash,expira_em) VALUES (?,?,DATE_ADD(CURRENT_TIMESTAMP(3),INTERVAL 10 MINUTE))",[usuarioId,tokenHash]);
  const bloqueio=await pool.getConnection();await bloqueio.beginTransaction();await bloqueio.execute("SELECT id FROM usuarios WHERE id=? FOR UPDATE",[usuarioId]);
  const repo=criarAutenticacaoRepository(pool);
  const redefinicao=repo.redefinirSenha(tokenHash,senhaNova);const login=repo.criarSessaoSeCredencialAtual(usuarioId,senhaAntiga,1,"hash-sessao-antiga",new Date(Date.now()+60000));
  await bloqueio.commit();bloqueio.release();
  await Promise.allSettled([redefinicao,login]);
  const[[ativas]]=await pool.execute("SELECT COUNT(*) quantidade FROM sessoes WHERE usuario_id=? AND revogada_em IS NULL",[usuarioId]);
  assert.equal(Number(ativas.quantidade),0);
});

test("movimentacoes concorrentes de categorias nao criam ciclo",async function(){
  const[a]=await pool.execute("INSERT INTO categorias(nome) VALUES ('Raiz A concorrente')");const[b]=await pool.execute("INSERT INTO categorias(nome) VALUES ('Raiz B concorrente')");
  const idA=Number(a.insertId);const idB=Number(b.insertId);const service=criarEstruturaService(criarEstruturaRepository(pool));
  const resultados=await Promise.allSettled([
    service.editarCategoria(idA,{categoriaPaiId:idB}),
    service.editarCategoria(idB,{categoriaPaiId:idA})
  ]);
  assert.equal(resultados.filter(function(r){return r.status==="fulfilled";}).length,1);
  const[registros]=await pool.execute("SELECT id,categoria_pai_id FROM categorias WHERE id IN (?,?) ORDER BY id",[idA,idB]);
  const pais=new Map(registros.map(function(r){return[Number(r.id),r.categoria_pai_id===null?null:Number(r.categoria_pai_id)];}));
  assert.equal(pais.get(idA)===idB&&pais.get(idB)===idA,false);
});
