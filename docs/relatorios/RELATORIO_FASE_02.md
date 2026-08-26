# RELATORIO DA FASE 02 - AUTENTICACAO E USUARIOS

Data: 26/08/2026  
Estado: **IMPLEMENTADA - AGUARDANDO VALIDACAO**

## 1. Resumo

A Fase 2 implementou cadastro de alunos, login, logout, sessoes persistidas, recuperacao e redefinicao de senha, perfis `aluno`, `professor` e `admin`, alem da administracao basica de usuarios no backend. A interface React recebeu os fluxos funcionais correspondentes, sem antecipar o design final.

Materiais, categorias funcionais, Google Drive, analytics, auditoria funcional, deploy e Fase 3 nao foram iniciados.

## 2. Branch e commits

- Branch: `fase/02-autenticacao`.
- Base: `main` no commit `9910d81`.
- Commit tecnico: `1f5b3e9` - `feat: implementa autenticacao da fase 2`.
- Correcao SMTP: `b0208f0` - `fix: corrige destinatario da recuperacao por smtp`.
- Correcao de renderizacao: `41cb059` - `fix: restaura renderizacao React no frontend`.
- O presente relatorio e o estado atualizado ficam no commit documental seguinte.
- Nenhum merge em `main` foi realizado.
- Nenhum deploy foi realizado.

## 3. Banco e migration

A migration `002_autenticacao.sql` criou:

- `usuarios`, com email unico, hash de senha, papel, estado ativo e timestamps;
- `sessoes`, com somente o hash do token, expiracao e revogacao;
- `recuperacoes_senha`, com somente o hash do token, expiracao e uso unico.

As tabelas usam InnoDB e `utf8mb4_unicode_ci`, com chaves estrangeiras, constraints e indices para os acessos implementados. A migration foi repetida sem duplicacao e tambem aplicada ao banco isolado de testes.

## 4. Funcionalidades implementadas

- cadastro publico exclusivamente como `aluno`;
- login e logout;
- consulta da sessao atual;
- sessoes opacas persistidas e revogaveis;
- solicitacao neutra de recuperacao de senha;
- redefinicao por token temporario e de uso unico;
- revogacao de todas as sessoes apos redefinicao;
- listagem, ativacao/desativacao e alteracao de papel exclusivas de admin;
- bootstrap controlado do primeiro admin;
- frontend funcional para cadastro, login, sessao, logout e recuperacao.

Um administrador local de teste foi criado pelo bootstrap e validado. Suas credenciais ficaram somente no ambiente local ignorado, foram removidas das variaveis de bootstrap depois do uso e nao constam deste relatorio nem do Git.

## 5. Endpoints

- `GET /api/autenticacao/csrf`;
- `POST /api/autenticacao/cadastro`;
- `POST /api/autenticacao/login`;
- `POST /api/autenticacao/logout`;
- `GET /api/autenticacao/me`;
- `POST /api/autenticacao/recuperacao-senha/solicitar`;
- `POST /api/autenticacao/recuperacao-senha/redefinir`;
- `GET /api/usuarios`;
- `PATCH /api/usuarios/:usuarioId/ativo`;
- `PATCH /api/usuarios/:usuarioId/papel`.

## 6. Seguranca

- senhas com Argon2id e parametros explicitos;
- senha minima de 12 caracteres e validacao de entrada;
- recusa de campos desconhecidos para impedir mass assignment;
- tokens aleatorios opacos, com somente SHA-256 armazenado no banco;
- cookies de sessao `HttpOnly`, `SameSite=Lax` e `Secure` em producao;
- protecao CSRF por token assinado e double-submit cookie;
- rate limit em cadastro, login e recuperacao;
- CORS com credenciais e origens explicitas;
- respostas de recuperacao neutras para emails existentes ou inexistentes;
- autorizacao administrativa no backend;
- revogacao de sessoes ao desativar usuario, alterar papel ou redefinir senha;
- redacao de cookies, cabecalhos, senhas e tokens nos logs;
- token de redefinicao removido da URL do navegador assim que lido;
- Nodemailer 9.0.5, sem vulnerabilidades conhecidas na auditoria executada.

## 7. SMTP e recuperacao

Foi implementado um provider SMTP configuravel por ambiente e um provider falso para testes automatizados. O remetente de teste e sua senha de app foram configurados somente no `backend/.env` ignorado.

A conexao autenticada com o SMTP do Gmail foi aprovada por TLS na porta configurada. Em seguida, uma solicitacao real de recuperacao para o administrador local retornou HTTP 200, persistiu um token hasheado ativo e teve a mensagem aceita pelo servidor SMTP para entrega. O token criado apenas para o smoke foi invalidado logo depois. Endereco, senha de app e token nao foram exibidos nem versionados. A confirmacao visual da chegada na caixa de entrada ou spam permanece manual.

O sistema exige configuracao SMTP completa antes de ativar o provider real; sem ela, mantem a resposta externa neutra e invalida o token que nao pôde ser entregue. A senha normal da conta nao deve ser usada.

## 8. Testes automatizados

Comando: `npm run check`.

Resultado: **27 testes aprovados, 0 falhas**, seguidos de build Vite aprovado.

Cobertura principal:

- configuracao geral e SMTP;
- cadastro valido, invalido, duplicado e mass assignment;
- Argon2id e ausencia de senha em texto puro;
- login valido, invalido, inexistente, inativo e tentativa de SQL injection;
- cookie seguro, hash de sessao, adulteracao, expiracao e logout;
- CSRF e rate limit contra brute force;
- autorizacao de aluno, professor e admin;
- bootstrap unico do primeiro admin;
- alteracao de papel/estado e revogacao de sessoes;
- recuperacao neutra, token hasheado, expirado, reutilizado e revogacao;
- provider SMTP incompleto e construcao segura do provider real;
- omissao de detalhes internos e protecao de logs.

## 9. Validacoes manuais e adicionais

- migrations executadas repetidamente sem duplicacao;
- login real do administrador local, consulta de sessao e logout aprovados;
- API iniciada em porta local livre;
- `GET /api/saude`: HTTP 200;
- `GET /api/autenticacao/csrf`: HTTP 200;
- Vite de desenvolvimento respondeu em `127.0.0.1:5173`;
- apos a correcao de renderizacao, backend e Vite foram reiniciados em portas locais livres e responderam HTTP 200;
- `App.jsx` foi renderizado em runtime e produziu o estado inicial esperado;
- os modulos transformados de `main.jsx` e `App.jsx` foram servidos com `React` definido no escopo;
- conexao autenticada com o SMTP do Gmail: aprovada;
- recuperacao real: HTTP 200, token hasheado persistido e mensagem aceita pelo SMTP;
- `npm audit`: 0 vulnerabilidades;
- `npm audit --omit=dev`: 0 vulnerabilidades;
- `git diff --check`: aprovado;
- sintaxe de todos os arquivos `.js`: aprovada;
- arquivos `.jsx`: validados pelo build Vite;
- nenhuma arrow function encontrada no codigo de primeira parte;
- `backend/.env` e `frontend/.env` confirmados como ignorados e ausentes do historico;
- nenhuma credencial real encontrada nos arquivos versionaveis.

O navegador integrado nao estava disponivel na sessao, portanto nao foi possivel realizar uma revisao visual automatizada. A interface foi validada por build, inicializacao do Vite e resposta HTTP.

## 10. Erros encontrados e corrigidos

- a primeira chamada do bootstrap pela raiz nao possuia script correspondente; o script do workspace e o atalho da raiz foram alinhados;
- a porta IPv4 `127.0.0.1:3000` estava ocupada pelo Live Preview do VS Code; os smokes foram realizados por `localhost` e depois em porta livre;
- Nodemailer 7 apresentou vulnerabilidades na auditoria; foi substituido pela versao 9.0.5 e a auditoria voltou a zero;
- o servico de recuperacao enviava `destinatario`, enquanto o provider SMTP lia `email`; o contrato foi alinhado, recebeu teste de regressao e o fluxo SMTP real foi repetido com sucesso;
- na validacao manual, o frontend abria em branco com `ReferenceError: React is not defined`; o transform JSX atual exige `React` no escopo, portanto o import padrao foi adicionado a `main.jsx` e `App.jsx`, sem alterar comportamento, dependencias ou escopo funcional;
- `node --check` nao aceita a extensao `.jsx`; esses arquivos foram corretamente validados pelo build Vite.

## 11. Riscos e pendencias

- confirmar manualmente a chegada da mensagem de teste na caixa de entrada ou spam;
- definir o remetente definitivo de producao;
- validar `TRUST_PROXY` conforme a topologia real da Hostinger;
- validar a dependencia nativa do Argon2 no ambiente de deploy;
- definir limpeza operacional de sessoes e tokens expirados;
- considerar armazenamento compartilhado para rate limit se houver mais de um processo;
- realizar teste visual/E2E quando um navegador integrado estiver disponivel.

## 12. Estado final

**FASE 2 IMPLEMENTADA - AGUARDANDO VALIDACAO**

A branch esta pronta para revisao humana. Nao houve merge em `main`, deploy, inicio da Fase 3 ou integracao com Google Drive.
