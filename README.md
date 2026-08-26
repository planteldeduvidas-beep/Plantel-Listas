# Plantel Listas

Fundação técnica do sistema Plantel Listas. O projeto usa React/Vite no frontend e um backend Node.js/Express em monolito modular por domínio, com MySQL.

O escopo funcional da V1 e as regras de continuidade estão em [`docs/LEIA_PRIMEIRO.md`](docs/LEIA_PRIMEIRO.md). A Fase 1 não implementa autenticação, permissões, materiais nem integração com Google Drive.

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
npm run audit:prod    # audita dependências de produção
```

O endpoint de fundação `GET /api/saude` responde `{"status":"ok"}`. Rotas inexistentes e erros usam o contrato `{ "erro": { "codigo", "mensagem" } }`.

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

Os diretórios de domínio estão reservados, sem funcionalidades antecipadas. Quando um domínio for autorizado, suas routes, controllers, services, repositories e validators devem permanecer dentro do próprio módulo.

## Segurança da fundação

- validação de ambiente antes de iniciar;
- pool MySQL sem múltiplas instruções na aplicação;
- CORS por lista explícita;
- headers Helmet e remoção de `X-Powered-By`;
- JSON limitado a 100 KB;
- logs estruturados com redação de `Authorization`, cookies, senha e tokens;
- stack trace omitida de respostas em produção;
- `.env`, logs, builds e dependências fora do Git.

Rate limit, cookies de sessão e proteção CSRF serão implementados com os endpoints de autenticação, na fase autorizada correspondente. Não existem rotas mutáveis nem cookies nesta fundação.

## Hostinger

A raiz contém `package.json`, lockfile, script `build`, script `start` e restrição de Node compatível com as versões 22.x e 24.x oferecidas pela Hostinger. O build gera `frontend/dist`, servido pelo Express quando `NODE_ENV=production`.

No deploy futuro, será necessário configurar as variáveis no hPanel e definir uma estratégia idempotente para migrations. A execução de migrations em produção e o deploy não fazem parte da Fase 1.

