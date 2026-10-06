// QA manual isolado: componentes e API reais; banco de testes, SMTP fake, sem Drive.
// Executar após build e migrations locais. Nunca apontar para produção.
const express = require('express');
const path = require('node:path');
const pino = require('pino');
const crypto = require('node:crypto');
const { obterConfiguracao } = require('../src/shared/config/ambiente');
const { criarPool } = require('../src/shared/database/conexao');
const { criarHashDaSenha } = require('../src/modules/autenticacao/senha');
const criarUsuarios = require('../src/modules/usuarios/usuarioRepository');
const { criarEmailProviderFake } = require('../src/shared/providers/emailProvider');
const criarAplicacao = require('../src/app');

async function iniciar() {
  const base = obterConfiguracao();
  const config = { ...base, ambiente:'test', confiarProxy:false,
    frontendUrl:'http://127.0.0.1:5190', origensCors:['http://127.0.0.1:5190'],
    banco:{...base.banco,nome:'plantel_gmail_transicao_qa'},
    defesa:{...base.defesa,chaveEvidencia:crypto.randomBytes(32).toString('hex')} };
  if (!['127.0.0.1','localhost'].includes(config.banco.host)) throw Error('QA requer banco local');
  const pool = criarPool(config.banco), usuarios = criarUsuarios(pool);
  const senha = await criarHashDaSenha('Senha-QA-local-123');
  for (const [email,papel,nome] of [['aluno-visual@example.com','aluno','Aluno Visual'],['admin-visual@example.com','admin','Admin Visual']]) {
    if (!await usuarios.buscarPorEmail(email)) await usuarios.criar(nome,email,senha,papel);
  }
  const aluno = await usuarios.buscarPorEmail('aluno-visual@example.com');
  await pool.execute('UPDATE usuarios SET faixa_etaria_declarada=NULL,faixa_etaria_declarada_em=NULL,faixa_etaria_origem=NULL WHERE id=?',[aluno.id]);
  const versoes = require('../../shared/documentosLegais.json');
  await pool.execute("INSERT IGNORE INTO aceites_termos_alunos(usuario_id,termos_versao,privacidade_versao,origem) VALUES (?,?,?,'conta')",[aluno.id,versoes.termos,versoes.privacidade]);
  const api = criarAplicacao(config,pino({level:'silent'}),{pool,emailProvider:criarEmailProviderFake(),
    googleDriveProvider:{},agendarTarefaGoogleDrive:()=>{},agendarTarefaGoogleDriveChanges:()=>{}});
  const app = express(), dist = path.resolve(__dirname,'../../frontend/dist');
  app.use((req,res,next)=>req.path.startsWith('/api/') ? api(req,res,next) : next());
  app.use(express.static(dist));
  app.use((req,res)=>res.sendFile(path.join(dist,'index.html')));
  app.listen(5190,'127.0.0.1',()=>console.log('QA real local em http://127.0.0.1:5190 (somente contas fictícias)'));
}
iniciar().catch(e=>{console.error(e.message);process.exitCode=1;});
