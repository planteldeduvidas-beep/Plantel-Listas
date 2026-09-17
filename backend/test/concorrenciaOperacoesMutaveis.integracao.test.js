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
