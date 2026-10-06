// Servidor de QA em memória: não conecta banco, SMTP, Drive ou produção.
// Executar manualmente: node frontend/test/fixtures/servidorPerfilVisual.mjs
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
const dados = { aplicavel:true, nome:'Aluno Visual', email:'qa@example.com', emailConfirmado:true, faixaEtaria:null, declaradaEm:null, origem:null, verificada:false, criadoEm:'2026-10-01T12:00:00Z', ultimoAcesso:'2026-10-06T12:00:00Z' };
const servidor = await createServer({
  root:fileURLToPath(new URL('../../',import.meta.url)), configFile:false,
  server:{host:'127.0.0.1',port:5188,strictPort:true,hmr:false},
  plugins:[{name:'qa-perfil-isolado',configureServer(vite){
    vite.middlewares.use('/api',async(req,res) => {
      res.setHeader('Content-Type','application/json'); res.setHeader('Cache-Control','no-store');
      if (req.url === '/autenticacao/csrf') return res.end(JSON.stringify({csrfToken:'token-apenas-qa-local'}));
      if (!['/autenticacao/perfil','/autenticacao/faixa-etaria'].includes(req.url)) { res.statusCode=404; return res.end('{}'); }
      if(req.method === 'POST') {
        let corpo=''; for await(const parte of req) corpo+=parte;
        const pedido=JSON.parse(corpo);
        dados.faixaEtaria=pedido.faixaEtaria; dados.declaradaEm=new Date().toISOString(); dados.origem='coleta_obrigatoria';
        if(pedido.nome) dados.nome=pedido.nome;
      }
      res.end(JSON.stringify(dados));
    });
  }}]
});
await servidor.listen();
console.log('QA visual isolado: http://127.0.0.1:5188/test/fixtures/perfilAluno.html');
