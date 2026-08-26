# Plantel Listas

Sistema Plantel Listas com React/Vite no frontend e backend Node.js/Express em monolito modular por domínio, com MySQL.

O escopo funcional da V1 e as regras de continuidade estão em [`docs/LEIA_PRIMEIRO.md`](docs/LEIA_PRIMEIRO.md). A Fase 2 implementa cadastro, autenticação, sessões, recuperação de senha e administração básica de usuários. Materiais e Google Drive permanecem fora do escopo.

## Requisitos locais

- Node.js 22.12 ou superior, até a linha 24.x;
- npm 10 ou superior;
- MySQL 8 com acesso a um usuário autorizado a criar o banco local.

O desenvolvimento de referência usa Laragon no Windows, mas os scripts dependem apenas de Node.js, npm e MySQL.

## Configuração

1. Instale as dependências na raiz:

   ```powershell
   npm install
   ```

2. Copie `.env.example` para `backend/.env` e preencha apenas no arquivo local. O `.env` é ignorado pelo Git.

3. Prepare o banco e execute as migrations:

   ```powershell
   npm run db:create
   npm run migrate
   ```

As variáveis esperadas são:

| Variável | Finalidade |
| --- | --- |
| `NODE_ENV` | `development`, `test` ou `production` |
| `PORT` | Porta HTTP; padrão `3000` |
| `LOG_LEVEL` | Nível dos logs estruturados |
| `CORS_ORIGENS` | Origens permitidas, separadas por vírgula; `*` é recusado |
| `DB_HOST` | Host do MySQL |
| `DB_PORT` | Porta do MySQL |
| `DB_USER` | Usuário do MySQL |
| `DB_PASSWORD` | Senha do MySQL, quando houver |
| `DB_NAME` | Nome do banco; padrão local `plantel_listas` |
| `DB_CONNECTION_LIMIT` | Limite do pool, entre 1 e 50 |
| `CSRF_SECRET` | Segredo aleatório com pelo menos 32 caracteres |
| `SESSION_DURATION_HOURS` | Validade da sessão |
| `PASSWORD_RESET_DURATION_MINUTES` | Validade do token de recuperação |
| `SESSION_COOKIE_NAME` / `CSRF_COOKIE_NAME` | Nomes dos cookies |
| `RATE_LIMIT_WINDOW_MINUTES` | Janela dos limitadores de autenticação |
| `AUTH_RATE_LIMIT_MAX` / `RECOVERY_RATE_LIMIT_MAX` | Limites por IP |
| `TRUST_PROXY` | Quantidade de proxies confiáveis; validar no deploy |
| `FRONTEND_URL` | URL usada no link de recuperação |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | Conexão SMTP opcional |
| `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Credenciais e remetente SMTP; nunca versionar |

Para Gmail, ative a verificação em duas etapas e use uma senha de app em `SMTP_PASSWORD`, sem espaços. Não use a senha normal da conta. Sem configuração SMTP completa, a solicitação de recuperação mantém resposta neutra, mas não envia mensagem.

## Scripts

```powershell
npm run dev:backend   # API com watch
npm run dev:frontend  # Vite em desenvolvimento
npm start             # API; em produção também serve frontend/dist
npm run build         # build do frontend
npm test              # testes automatizados do backend
npm run check         # testes e build
npm run db:create     # cria o banco com utf8mb4
npm run migrate       # aplica migrations pendentes
npm run bootstrap:admin # cria o primeiro admin de modo controlado
npm run audit:prod    # audita dependências de produção
```

Antes do primeiro `bootstrap:admin`, preencha temporariamente `BOOTSTRAP_ADMIN_EMAIL` e `BOOTSTRAP_ADMIN_PASSWORD` no `.env`; limpe ambos logo após a execução. O script recusa criar um segundo administrador.

O endpoint `GET /api/saude` responde `{"status":"ok"}`. A API também expõe `/api/autenticacao/*` para cadastro, login, logout, sessão e recuperação, e `/api/usuarios/*` para operações exclusivas de administrador. Rotas inexistentes e erros usam o contrato `{ "erro": { "codigo", "mensagem" } }`.

## Estrutura

```text
backend/
  migrations/
  scripts/
  src/
    modules/
      autenticacao/ usuarios/ materiais/ categorias/
      permissoes/ analytics/ auditoria/
    shared/
      config/ database/ errors/ middlewares/ providers/ utils/
    app.js
    server.js
  test/
frontend/
  src/
docs/
```

Os módulos de autenticação e usuários seguem routes, controllers, services, repositories e validators. Os demais diretórios de domínio continuam reservados, sem funcionalidades antecipadas.

## Segurança

- validação de ambiente antes de iniciar;
- pool MySQL sem múltiplas instruções na aplicação;
- CORS por lista explícita;
- headers Helmet e remoção de `X-Powered-By`;
- JSON limitado a 100 KB;
- logs estruturados com redação de `Authorization`, cookies, senha e tokens;
- stack trace omitida de respostas em produção;
- `.env`, logs, builds e dependências fora do Git.
- senhas com Argon2id e sem armazenamento em texto puro;
- tokens opacos de sessão e recuperação, com apenas hashes no banco;
- cookies de sessão `HttpOnly`, `SameSite=Lax` e `Secure` em produção;
- proteção CSRF e rate limit nos endpoints sensíveis;
- recuperação neutra, token de uso único e revogação das sessões após redefinição;
- autorização administrativa validada no backend.

## Hostinger

A raiz contém `package.json`, lockfile, script `build`, script `start` e restrição de Node compatível com as versões 22.x e 24.x oferecidas pela Hostinger. O build gera `frontend/dist`, servido pelo Express quando `NODE_ENV=production`.

No deploy futuro, será necessário configurar as variáveis no hPanel, validar `TRUST_PROXY`, SMTP e a dependência nativa do Argon2, além de definir uma estratégia idempotente para migrations. A execução de migrations em produção e o deploy não fazem parte da Fase 2.

