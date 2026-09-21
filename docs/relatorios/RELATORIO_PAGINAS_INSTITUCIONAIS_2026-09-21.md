# RELATÓRIO DAS PÁGINAS INSTITUCIONAIS

Data: 21/09/2026  
Branch: `fase/09-qa-producao`  
Estado: **IMPLEMENTAÇÃO CONCLUÍDA — PENDENTE PREENCHIMENTO E REVISÃO JURÍDICA**

## 1. Resumo da implementação

Foram criadas páginas públicas e responsivas de Política de Privacidade e Termos de Uso, integradas à identidade visual do Plantel Listas e acessíveis sem autenticação. As telas de login, cadastro e recuperação agora exibem links institucionais discretos.

O backend de produção passou a entregar o `index.html` para rotas públicas da SPA sem interferir nas rotas `/api`. Assim, o acesso direto e o refresh de `/privacidade` e `/termos` funcionam quando o build é servido pelo processo Node. A operação documenta o rewrite equivalente para o caso de a Hostinger servir o frontend diretamente.

Não houve deploy, alteração no Google Cloud, mudança de credenciais, escopos OAuth ou banco de dados.

## 2. Arquivos criados

- `frontend/src/PaginaInstitucional.jsx`;
- `docs/relatorios/RELATORIO_PAGINAS_INSTITUCIONAIS_2026-09-21.md`.

## 3. Arquivos alterados

- `frontend/src/App.jsx` — seleção das rotas públicas e links nas telas de acesso;
- `frontend/src/navegacao.js` — reconhecimento estrito de `/privacidade` e `/termos`;
- `frontend/src/styles.css` — layout institucional, responsividade e temas claro/escuro;
- `backend/src/app.js` — fallback seguro da SPA em produção;
- `backend/test/app.test.js` — teste de fallback e preservação de 404 da API;
- `backend/test/navegacaoFrontend.test.js` — teste das rotas públicas;
- `docs/OPERACAO_PRODUCAO.md` — orientação de fallback/rewrite na hospedagem.

O arquivo `frontend/src/styles.css` já possuía, antes desta tarefa, uma alteração local de espaçamento da área administrativa de usuários. Ela foi preservada.

## 4. Rotas criadas

- `GET /privacidade` — Política de Privacidade pública;
- `GET /termos` — Termos de Uso públicos.

As duas rotas possuem título e descrição próprios, links entre si e retorno para a página inicial do Plantel Listas.

## 5. Dados pessoais identificados

### Fornecidos pelo usuário

- nome;
- e-mail;
- senha;
- assunto e mensagem de suporte;
- nova senha e token temporário no fluxo de recuperação.

### Gerados automaticamente

- identificadores de conta e sessão;
- hashes de sessão e recuperação;
- datas de criação, expiração, revogação e atualização;
- endereço IP, user-agent, identificador, data e hora nos logs HTTP operacionais;
- perfil, estado da conta e permissões.

### Uso, segurança e auditoria

- acessos a pastas;
- termos pesquisados;
- visualizações e downloads;
- histórico pessoal de materiais do aluno;
- ações administrativas e de professores, com ator, entidade, resultado, contexto e data;
- operações de gestão de materiais e estados de reconciliação com o Drive.

### Google Drive institucional

- metadados e conteúdo de arquivos/pastas do acervo configurado;
- estado de sincronização e mudanças;
- credencial OAuth da conta institucional responsável pelo acervo.

Alunos não conectam suas próprias contas Google.

## 6. Proteção atual das senhas

As senhas não são armazenadas em texto puro. O backend gera hash com **Argon2id**, usando a biblioteca `argon2`. Tokens de sessão e recuperação são persistidos como hash SHA-256. A página pública descreve o mecanismo sem expor parâmetros internos desnecessários.

## 7. Cookies e sessões

Foram confirmados dois cookies estritamente necessários:

- cookie de sessão autenticada;
- cookie de proteção CSRF.

Ambos são `HttpOnly`, usam `SameSite=Lax`, caminho `/` e recebem `Secure` em produção. O frontend obtém o token CSRF autenticado pelo corpo da resposta e o mantém em memória. Não foi identificado cookie publicitário ou de rastreamento de terceiros.

## 8. Integrações externas relevantes

- MySQL para dados da aplicação;
- SMTP para recuperação de senha e mensagens de suporte;
- Google Drive para o acervo institucional;
- hospedagem/proxy de produção ainda a configurar.

O Google Drive usa o escopo `https://www.googleapis.com/auth/drive`. O refresh token permanece no backend e, quando persistido no MySQL, é criptografado. A Política informa que o uso de dados das APIs Google observa a política aplicável, inclusive os requisitos de Uso Limitado.

## 9. Conteúdo principal da Política

A Política apresenta responsável, dados tratados, finalidades, bases legais prudentes, compartilhamento técnico, armazenamento e segurança, retenção, direitos previstos na LGPD, cookies necessários, integração institucional com Google Drive, alterações e contato.

Os eventos brutos de analytics foram descritos com retenção configurável e padrão atual de 180 dias, conforme o código. Não foi inventada coleta publicitária nem conexão Google de alunos.

## 10. Conteúdo principal dos Termos

Os Termos cobrem aceitação, finalidade educacional, conta e credenciais, perfis, uso de materiais, condutas proibidas, atuação de professores, disponibilidade, links externos e parceiros, propriedade intelectual prudente, suspensão de acesso, privacidade, alterações e contato.

## 11. Testes executados

- build Vite do frontend;
- testes direcionados de aplicação e navegação: 11 aprovados;
- acesso sem login a `/privacidade` e `/termos`;
- refresh direto de `/termos`;
- navegação entre os documentos;
- retorno à tela de login;
- presença dos links na tela de acesso;
- inspeção visual em desktop nos temas claro e escuro;
- inspeção visual responsiva equivalente a viewport móvel, sem perda de conteúdo ou navegação;
- fallback de produção com preservação do 404 JSON em `/api`;
- `git diff --check`.

O `npm run check` também foi iniciado. Ele parou no `pretest`, antes de executar a suíte, porque o MySQL local estava desligado (`ECONNREFUSED 127.0.0.1:3306`). O serviço não foi religado apenas para esta validação. Essa limitação não afetou os 11 testes direcionados nem o build já aprovados.

As verificações `npm audit` e `npm audit --omit=dev` foram concluídas com **zero vulnerabilidades**.

## 12. Resultado do build

O build transformou 33 módulos e foi concluído sem erro.

## 13. Revisão de segurança

As páginas não exibem secrets, tokens, nomes de tabelas, IDs do Drive, Client ID, Client Secret, endpoints administrativos ou dados de usuários. A única ligação externa adicionada aponta para a política oficial das APIs Google e abre em nova aba com `rel="noreferrer"`.

O fallback aceita somente `GET` com preferência por HTML, exclui caminhos `/api/` e é ativado apenas em produção.

## 14. Identificação confirmada e pendências humanas

Identificação informada pelo responsável:

- razão social: `PLANTEL DE DUVIDAS EDUCACAO E ENSINO LTDA - ME`;
- CNPJ: `67.044.178/0001-05`;
- contato de privacidade e suporte: `suporteplantellistas@gmail.com`.

Antes da publicação definitiva, preencher e revisar:

- endereço empresarial, caso o responsável jurídico entenda necessário;
- identificação do responsável jurídico ou encarregado, caso aplicável;
- revisão jurídica final da Política e dos Termos;
- fornecedor definitivo de hospedagem e seus dados contratuais, se houver necessidade de identificação;
- rewrite para `index.html` na Hostinger se os arquivos estáticos não forem servidos pelo processo Node.

Depois que as páginas estiverem públicas e revisadas, cadastrar manualmente no Google Cloud:

**Política de Privacidade:**  
`https://plantelistas.planteldeduvidas.com.br/privacidade`

**Termos de Uso:**  
`https://plantelistas.planteldeduvidas.com.br/termos`

## 15. Conclusão

As duas páginas existem, são públicas, representam o tratamento observado no código e estão integradas ao produto. A implementação técnica está concluída, mas os placeholders jurídicos impedem que o conteúdo seja considerado definitivo para publicação até o preenchimento e a revisão humana.

Não houve deploy nem alteração no Google Cloud.
