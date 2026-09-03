# RELATORIO DA FASE 9A - QA FINAL, SEGURANCA E PREPARACAO DE PRODUCAO

Data: 03/09/2026  
Estado: **PRONTA PARA AUTORIZACAO DE CONFIGURACAO/DEPLOY**

## 1. Escopo e repositorio

A Fase 9A foi executada exclusivamente na branch `fase/09-qa-producao`, derivada do commit estavel `b23976ab1dc8046f54acfae4c639a2ea08770da3`. No inicio da fase, `main` e `origin/main` apontavam para `4aa2100ddf23d43c114630b6fe13c700a0402e3b`.

Nao houve merge em `main`, push, deploy, alteracao de DNS/Hostinger/Google Cloud nem uso de segredo real em arquivo rastreado. Nenhuma funcionalidade fora do escopo da V1 foi criada.

## 2. QA funcional

Os testes automatizados revalidaram autenticacao, cadastro com nome, recuperacao, logout, sessao, bloqueio, papeis, CSRF, rate limits, acervo, pastas, busca, filtros, paginacao, PDF, video, Range, download, permissoes, administracao, analytics, CSV, auditoria, suporte e historico pessoal.

No Chrome conectado foram percorridos os tres papeis:

- aluno: biblioteca, filtros, historico, suporte, apresentacao inicial, temas e logout;
- professor: biblioteca, pastas liberadas, controles de gestao, suporte e logout;
- admin: painel, usuarios, acessos, organizacao, historico, Google Drive e biblioteca.

Nao foram observados erros de console alem das mensagens informativas do Vite/React. As mudancas visuais aprovadas anteriormente foram preservadas.

A verificacao visual conectada cobriu desktop em tema claro e escuro. A tentativa de abrir um Chrome headless separado para repetir exatamente `320x568`, `390x844`, `768x1024`, `1024x768`, `1366x768`, `1920x1080` e `2560x1440` foi bloqueada pelo ambiente antes da inicializacao. Como evidencia complementar, o fechamento funcional anterior ja havia aprovado cadastro e fluxo do aluno entre 320 e 1920 px. A repeticao exata dos sete tamanhos e dos tres papeis permanece no checklist humano de pre-deploy; nao foi declarada como executada nesta fase.

## 3. Google Drive e concorrencia

O teste `npm run test:drive:write` foi aprovado contra o Drive real usando exclusivamente uma arvore temporaria. Foram validados upload, renomeacao, movimentacao, substituicao, lixeira, restauracao, exclusao definitiva, limites de papel e barreira da pasta raiz. Todos os registros e itens temporarios foram removidos; nenhum arquivo legado foi alterado.

A auditoria encontrou uma condicao real: duas mutacoes concorrentes poderiam alterar o Drive antes de o conflito otimista no MySQL ser detectado, e a compensacao do perdedor poderia desfazer o vencedor. A correcao usa uma trava MySQL compartilhada por banco entre mutacoes locais, sincronizacao completa e Changes API, antes da primeira escrita fisica.

O teste integrado confirma resposta 409 antes de chamar o provider quando outra operacao possui a trava. Tambem foi observado que um backlog da Changes API podia monopolizar a trava. Cada ciclo agora processa no maximo 25 mudancas e persiste o proximo `pageToken`; o cliente OAuth de acesso e reutilizado em memoria, evitando obter novo access token em cada consulta. O refresh token permanece criptografado e exclusivamente no backend.

O fluxo continua bidirecional:

- Plantel para Drive: alteracao fisica primeiro, atualizacao imediata do MySQL e compensacao controlada quando aplicavel;
- Drive para Plantel: Changes API, webhook HTTPS quando disponivel e polling automatico de recuperacao, sem depender de botao manual.

## 4. Seguranca

Foram revisados autenticacao, autorizacao, IDOR, IDs manipulados, raiz do Drive, origem/destino, SQL injection, XSS, mass assignment, tamanhos, MIME spoofing, nomes perigosos e falhas de provider. Os testes existentes permaneceram aprovados.

Correcao e hardening aplicados:

- cookie CSRF tambem `HttpOnly`; o token usado pelo frontend continua vindo do corpo JSON autenticado;
- CORS aceita apenas origens exatas, sem caminho, credenciais, query ou fragmento;
- producao exige HTTPS, `TRUST_PROXY` positivo, SMTP completo, destinatario de suporte e configuracao completa do Drive;
- `GOOGLE_DRIVE_ENCRYPTION_KEY` exclusiva em producao, separada do segredo CSRF;
- pool MySQL com fila finita e timeout de conexao;
- SMTP com timeouts de conexao, saudacao e socket;
- shutdown gracioso e tratamento de `unhandledRejection` e `uncaughtException`;
- logs preservam redacao de autorizacao, cookies, CSRF, senhas, tokens e secrets.

Helmet, CSP existente, `nosniff`, cookies `Secure` em producao, `SameSite=Lax`, cache privado e rate limits foram mantidos. Nenhum controle existente foi enfraquecido.

A varredura dos arquivos rastreados, historico Git, build e source maps nao encontrou `.env` real, senha, token OAuth ou padrao forte de secret. `backend/.env` e `frontend/.env` permanecem ignorados.

## 5. OAuth e SMTP

O scope funcional permanece `https://www.googleapis.com/auth/drive`. O estado local usa credencial backend criptografada e suporte a reconexao. Credencial revogada/expirada produz erro controlado e marca renovacao necessaria.

O projeto OAuth ainda nao deve ser presumido como pronto. Antes do go-live, o responsavel deve configurar a tela de consentimento para producao, callback HTTPS final, webhook HTTPS final, dominios autorizados, verificacao do scope restrito e eventual security assessment. Referencias oficiais: [OAuth 2.0 do Google](https://developers.google.com/identity/protocols/oauth2) e [verificacao de scopes restritos](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification).

O Gmail SMTP com senha de aplicativo ja havia sido validado manualmente antes da fase. Nesta auditoria nao foi enviado novo e-mail real. Foram verificados uso exclusivo de variaveis de ambiente, TLS configuravel, timeouts, falha controlada e ausencia de credenciais em Git/logs. A conta e a senha nao foram trocadas nem exibidas.

## 6. Banco, migrations, backup e restore

As migrations 001 a 013 foram executadas em ordem numa base local limpa. O resultado teve 24 tabelas InnoDB, collation `utf8mb4_unicode_ci`, 93 indices, 30 chaves estrangeiras, 8 constraints `CHECK` e 13 registros de migration. A base temporaria foi removida.

O restore tambem foi comprovado: foi gerado dump logico consistente da base local (3.521.292 bytes), importado numa segunda base temporaria e validadas 24 tabelas, 13 migrations e as contagens essenciais. O dump e a base de restore foram removidos. Nenhuma restauracao foi feita sobre a base original ou sobre producao.

Nao foram criadas ou alteradas migrations na Fase 9A. Como DDL MySQL pode ter commit implicito, rollback da aplicacao nao deve presumir rollback do schema. O procedimento completo esta em `docs/OPERACAO_PRODUCAO.md`.

## 7. Performance e capacidade

A carga controlada usou o MySQL local e a aplicacao em processo, sem chamadas ao Drive: 270 requests, concorrencia 5, acervo de referencia com 6.753 materiais disponiveis e 2.668 pastas ativas.

| Endpoint/cenario | Media | p95 | Erros |
| --- | ---: | ---: | ---: |
| raiz e contagem recursiva | 110,54 ms | 120,67 ms | 0 |
| pasta | 46,92 ms | 48,69 ms | 0 |
| busca | 83,46 ms | 87,21 ms | 0 |
| filtros | 98,43 ms | 102,79 ms | 0 |
| paginacao | 103,26 ms | 109,81 ms | 0 |
| usuarios | 5,27 ms | 5,85 ms | 0 |
| analytics | 69,48 ms | 82,52 ms | 0 |
| auditoria/historico geral | 7,84 ms | 9,30 ms | 0 |
| historico pessoal | 4,66 ms | 5,47 ms | 0 |

Nao apareceu evidencia para reescrever queries. Foram adicionados limites de fila/conexao do pool e lote do Changes API. Os limites reais do plano, proxy e upload devem ser confirmados no hPanel antes do deploy.

## 8. Producao, Hostinger e subdominio

O planejamento preserva a Home atual em `planteldeduvidas.com.br` e usa `listas.planteldeduvidas.com.br` para o sistema. O deploy devera separar o build estatico e o processo Node, encaminhar `/api`, manter HTTPS, configurar health check, logs, restart e armazenamento temporario efemero.

O suporte e os limites exatos de Node.js, MySQL, upload, processo e timeout dependem do plano contratado e devem ser confirmados no painel. Nenhuma configuracao da Hostinger ou DNS foi alterada. O link institucional para a Home ja existe na navegacao e nao e mais pendencia funcional.

## 9. Configuracao e operacao

O carregamento de ambiente agora falha cedo em producao se faltarem URLs HTTPS, proxy confiavel, SMTP, suporte, OAuth, raiz, callback, webhook ou chave de criptografia. `.env.example` possui somente placeholders e inclui fila/timeout MySQL, timeouts SMTP e chave exclusiva do Drive.

Foi criado `docs/OPERACAO_PRODUCAO.md` com inicializacao, restart, health, migrations, logs, reconexao/sincronizacao do Drive, SMTP, backup, restore e rollback.

## 10. Testes e evidencias

Executados durante a fase:

- `npm run check`: aprovado, com 110 testes backend e build Vite de 32 modulos;
- testes direcionados de Drive/Changes/concorrencia: 23 aprovados;
- `npm run test:drive:write`: aprovado no Drive real, com limpeza confirmada;
- `npm run qa:load`: 270 requests, concorrencia 5, zero erros;
- migrations 001-013 em banco limpo: aprovadas;
- dump/restore em banco isolado: aprovado;
- `npm audit` e `npm audit --omit=dev`: zero vulnerabilidades nas verificacoes online da fase; na repeticao final o registry respondeu HTTP 503, e a verificacao final com cache local (`--offline`) tambem retornou zero;
- `git diff --check`: aprovado nas verificacoes da fase.

## 11. Riscos e pendencias humanas

Antes do go-live, ainda e obrigatorio:

- confirmar o plano e os limites reais no hPanel;
- criar/configurar `listas.planteldeduvidas.com.br`, SSL e proxy sem substituir a Home;
- cadastrar todas as variaveis reais no cofre/painel, nunca no Git;
- criar MySQL de producao, executar backup inicial e comprovar restore isolado nesse ambiente;
- configurar/publicar OAuth, callback e webhook HTTPS, concluindo verificacao/assessment aplicaveis;
- validar um envio real de recuperacao e suporte depois da configuracao;
- agendar `npm run analytics:retention` e backups;
- repetir o smoke test humano nos sete viewports e nos tres papeis;
- medir carga e agregacoes no banco de producao somente durante deploy autorizado;
- registrar o commit aprovado de release e o ponto de rollback.

## 12. Arquivos

Criados:

- `backend/scripts/medirCargaLocal.js`;
- `backend/test/cookies.test.js`;
- `docs/OPERACAO_PRODUCAO.md`;
- `docs/relatorios/RELATORIO_FASE_09.md`;
- assets de marca em `frontend/public/` provenientes dos ajustes visuais aprovados.

Alterados na Fase 9A: configuracao de ambiente, conexao MySQL, provider SMTP, cookies, servidor, provider/servicos/repositorios do Google Drive, scripts npm e testes relacionados. Os arquivos frontend ja modificados antes da retomada foram preservados e validados, sem novo redesenho.

Migrations criadas ou alteradas: **nenhuma**.

Estado Git previsto para o fechamento: branch `fase/09-qa-producao`, alteracoes versionadas no commit da fase e arvore de trabalho limpa. O hash final e registrado na entrega ao responsavel humano, pois o proprio relatorio integra esse commit.

## 13. Conclusao

**PRONTA PARA AUTORIZACAO DE CONFIGURACAO/DEPLOY**

O codigo e o processo operacional estao prontos para a proxima etapa acompanhada. Esse estado nao significa que a producao ja esteja configurada: OAuth, Hostinger, DNS, MySQL, secrets, backup definitivo e deploy continuam pendentes de autorizacao e execucao humana passo a passo.

Nao houve merge em `main` nem deploy. A Fase 9A termina neste relatorio e deve parar aguardando autorizacao.
