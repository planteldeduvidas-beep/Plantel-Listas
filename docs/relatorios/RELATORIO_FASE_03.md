# RELATORIO DA FASE 03 - ESTRUTURA DO ACERVO

Data: 26/08/2026  
Estado: **PRONTA PARA VALIDACAO**

## 1. Resumo

A Fase 3 implementou a estrutura funcional do acervo orientada pelo MySQL: categorias hierarquicas, disciplinas, concursos e permissoes de professor por categoria. O backend manteve o monolito modular por dominio e o frontend recebeu somente a interface minima necessaria para validar as regras por perfil.

Nao foram implementados materiais, arquivos, Google Drive, OAuth, upload, download, player, analytics, auditoria funcional, design final, deploy ou Fase 4.

Tags genericas nao foram criadas porque ainda nao existe caso funcional aprovado que justifique uma taxonomia adicional. Disciplinas e concursos fornecem as classificacoes normalizadas previstas para a proxima evolucao do acervo.

## 2. Branch e commits

- Branch: `fase/03-estrutura-acervo`.
- Base: `main` no commit `d842c15`.
- Commit tecnico: `0d42372` - `feat: implementa estrutura do acervo da fase 3`.
- Commit documental inicial: `01e27cc` - `docs: registra conclusao da fase 3`.
- Correcao de UX: `fee5a62` - `fix: simplifica experiencia da fase 3`.
- A presente atualizacao do relatorio fica no commit documental seguinte.
- Nenhum merge em `main` foi realizado.
- Nenhum deploy foi realizado.

## 3. Arquivos

Criados:

- `backend/migrations/003_estrutura_acervo.sql`;
- modulo `categorias`: controller, repository, routes, service e validator da estrutura do acervo;
- modulo `permissoes`: controller, repository, routes, service e validator;
- `backend/test/estruturaAcervo.integracao.test.js`;
- `frontend/src/PainelAcervo.jsx`;
- este relatorio.

Alterados:

- `backend/src/app.js` para registrar os novos modulos;
- `backend/test/autenticacao.integracao.test.js` para limpeza segura das novas tabelas na regressao;
- `frontend/src/App.jsx`, `frontend/src/api.js` e `frontend/src/styles.css`;
- `README.md` e `docs/ESTADO_ATUAL_DO_PROJETO.md`.

## 4. Dependencias

Nenhuma dependencia foi adicionada. Express, `mysql2`, React e os recursos nativos existentes cobrem o escopo. O lockfile e as versoes da Fase 2 permaneceram inalterados.

## 5. Migration e modelagem

A migration versionada `003_estrutura_acervo.sql` criou quatro tabelas, todas InnoDB e `utf8mb4_unicode_ci`:

### `categorias`

- nome e descricao estrutural;
- `categoria_pai_id` opcional com foreign key para a propria tabela;
- coluna gerada interna para unicidade de nome dentro do mesmo pai, inclusive categorias raiz;
- ordem de exibicao;
- estado ativo/inativo;
- timestamps;
- indices por pai/ordem e estado.

### `disciplinas` e `concursos`

- nome unico;
- descricao opcional;
- estado ativo/inativo;
- timestamps;
- indice para consulta publica ativa por nome.

### `permissoes_professor_categoria`

- professor e categoria;
- administrador que concedeu;
- administrador que revogou;
- timestamps de concessao, revogacao e atualizacao;
- unique constraint professor/categoria;
- indices para consultas ativas por professor e categoria;
- foreign keys para usuarios e categorias.

A tabela de materiais nao foi criada. Nenhuma estrutura do Google Drive foi hard-coded ou persistida.

## 6. Endpoints e contratos

Consulta autenticada por aluno, professor e admin:

- `GET /api/estrutura-acervo`: retorna `estrutura.categorias` como arvore e listas ativas de disciplinas e concursos.

Administracao exclusiva de admin:

- `GET /api/categorias`;
- `POST /api/categorias`;
- `PATCH /api/categorias/:id`;
- `PATCH /api/categorias/:id/ativo`;
- `GET|POST /api/disciplinas`;
- `PATCH /api/disciplinas/:id`;
- `PATCH /api/disciplinas/:id/ativo`;
- `GET|POST /api/concursos`;
- `PATCH /api/concursos/:id`;
- `PATCH /api/concursos/:id/ativo`;
- `GET /api/permissoes`;
- `POST /api/permissoes`;
- `DELETE /api/permissoes/:id`.

Consulta exclusiva do professor autenticado:

- `GET /api/permissoes/minhas`: deriva a identidade de `req.usuario` e ignora qualquer tentativa de informar outro professor por query string.

Todas as respostas de erro mantem o contrato `{ "erro": { "codigo", "mensagem" } }`.

## 7. Regras de negocio

- somente admin cria, edita, ativa e desativa estrutura;
- categorias inativas nao podem ser editadas, apenas reativadas;
- disciplina ou concurso inativo nao pode ser editado, apenas reativado;
- consulta comum retorna somente registros ativos;
- categoria pai deve existir e estar ativa;
- categoria nao pode ser pai de si mesma;
- movimentacao nao pode apontar para descendente e criar ciclo;
- categoria com filha ativa nao pode ser desativada;
- nomes de categorias sao unicos dentro do mesmo pai;
- nomes de disciplinas e concursos sao unicos;
- somente professor ativo pode receber permissao;
- categoria autorizada deve existir e estar ativa;
- somente admin concede, revoga e consulta todas as permissoes;
- admin nao pode conceder permissao a si mesmo;
- permissao ativa duplicada e recusada;
- permissao revogada pode ser concedida novamente;
- professor consulta somente as proprias areas ativas;
- frontend nunca e usado como prova de autorizacao.

## 8. Matriz de autorizacao implementada

| Operacao | Aluno | Professor | Admin |
| --- | --- | --- | --- |
| Consultar estrutura ativa | Sim | Sim | Sim |
| Consultar proprias areas | Nao | Sim | Nao, usa consulta administrativa |
| Consultar todas as permissoes | Nao | Nao | Sim |
| Criar/editar estrutura | Nao | Nao | Sim |
| Ativar/desativar estrutura | Nao | Nao | Sim |
| Conceder/revogar permissao | Nao | Nao | Sim |
| Administrar usuarios | Nao | Nao | Sim, conforme Fase 2 |

## 9. Hierarquia

A hierarquia usa adjacency list simples por `categoria_pai_id`, orientada integralmente pelo banco. A consulta publica monta a arvore a partir dos registros ativos. A verificacao de ciclos usa CTE recursiva para obter a subarvore da categoria antes de qualquer movimentacao.

Nao foram inseridas por hard-code as pastas `LISTAS`, `PROVAS ANTIGAS` ou seus exemplos. O banco local permanece sem seed estrutural obrigatorio.

## 10. Permissoes de professor

A permissao persistida representa exatamente professor -> categoria autorizada. Identidade, papel do professor, estado do usuario, existencia/estado da categoria e autoria administrativa sao revalidados no backend.

A estrutura esta preparada para que a futura fase de materiais consulte essa permissao antes de upload, edicao, movimentacao e lixeira, mas nenhuma dessas operacoes foi implementada agora.

## 11. Frontend

- aluno visualiza categorias ativas em arvore, disciplinas e concursos;
- professor visualiza a mesma estrutura e somente as proprias areas autorizadas;
- admin possui formularios funcionais minimos para categorias, hierarquia, disciplinas, concursos e permissoes;
- estados inativos e permissoes revogadas sao identificados na administracao;
- erros do backend sao exibidos ao usuario;
- nenhum design final ou integracao de arquivos foi antecipado.

## 12. Seguranca

- todas as mutacoes exigem sessao, papel admin e CSRF valido;
- CORS restritivo e protecoes da Fase 2 foram preservados;
- validators recusam campos desconhecidos e mass assignment;
- IDs precisam ser inteiros positivos;
- SQL usa parametros para todo dado do cliente;
- nomes de tabela dinamicos existem somente em configuracao interna fechada do repository;
- professor nao informa `usuarioId` para consultar as proprias permissoes;
- aluno e professor recebem 403 em endpoints administrativos;
- consultas privadas mantem `Cache-Control: no-store`;
- nenhum token, senha ou secret foi adicionado ao frontend, banco estrutural ou logs.

## 13. Testes automatizados

Comando final: `npm run check`.

Resultado: **38 testes aprovados, 0 falhas**, seguidos de build Vite aprovado com 26 modulos transformados.

Os 11 testes de integracao novos cobrem:

- migration, engine, collation, indice unico e constraints;
- criacao e consulta publica da hierarquia;
- categoria pai/filha/neta;
- pai proprio, ciclo, pai inexistente e desativacao invalida;
- registro inativo e reativacao;
- disciplinas, concursos, duplicidade e edicao;
- admin autorizado, professor/aluno negados;
- CSRF em todas as 11 rotas mutaveis da Fase 3;
- mass assignment, IDs manipulados e SQL injection;
- concessao, duplicidade, consulta, revogacao e reconcessao;
- professor/categoria invalidos e auto-concessao;
- IDOR e isolamento das permissoes do professor.

## 14. Regressao da Fase 2

Os 27 testes anteriores continuaram aprovados, incluindo cadastro, login, sessoes, roles, cookies, CSRF, rate limit, recuperacao de senha, SMTP, logs e erros. A limpeza do banco de teste foi ampliada respeitando as novas foreign keys.

## 15. Testes manuais e smokes

- migration `003` aplicada no banco local;
- segunda execucao reconheceu a migration sem duplicar schema;
- schema local confirmado com quatro tabelas validas e cinco foreign keys;
- backend iniciou em porta local livre e `GET /api/saude` respondeu HTTP 200;
- Vite iniciou em porta local livre;
- HTML, `main.jsx` e `PainelAcervo.jsx` responderam HTTP 200;
- navegador integrado indisponivel, portanto nao houve revisao visual automatizada nesta sessao.

## 16. Auditoria de dependencias e qualidade

- `npm audit`: 0 vulnerabilidades;
- `npm audit --omit=dev`: 0 vulnerabilidades;
- nenhuma dependencia nova;
- `git diff --check`: aprovado;
- sintaxe de todos os arquivos `.js`: aprovada;
- nenhuma arrow function em codigo de primeira parte `.js`/`.jsx`;
- build React/Vite aprovado.

## 17. Erros encontrados e corrigidos

- MySQL recusou uma `CHECK` que referenciava a coluna auto-incremento da propria categoria; a constraint redundante foi removida antes da aplicacao, mantendo pai proprio e ciclos protegidos no service;
- tres testes acumularam o rate limit de login pelo mesmo IP; os limites foram elevados somente no aplicativo isolado da Fase 3, preservando o teste especifico de brute force da Fase 2;
- o formulario generico do frontend inicialmente nao apresentava falhas da API; o tratamento de erro foi conectado ao aviso comum do painel;
- a limpeza recursiva de imagens temporarias foi bloqueada pelo executor; os sete arquivos exatos foram removidos de forma controlada depois da confirmacao do caminho.

## 18. Erros abertos

Nenhum erro de codigo, schema, teste, build ou dependencia permanece aberto.

A revisao visual automatizada nao foi executada por ausencia de navegador integrado; isso e uma limitacao de validacao, nao erro conhecido da aplicacao.

## 19. Riscos

- migrations futuras devem continuar pequenas devido ao commit implicito de DDL no MySQL;
- mudancas concorrentes muito raras na hierarquia dependem da serializacao operacional administrativa; considerar locks transacionais se o volume administrativo justificar;
- a permissao atual guarda o estado e autoria mais recente; historico completo de eventos pertence a auditoria da fase futura;
- dados estruturais reais ainda precisam de curadoria humana antes da integracao/indexacao do Drive;
- validar visualmente os tres perfis durante a revisao humana.

## 20. Pendencias

- revisao humana da Fase 3;
- cadastrar a estrutura real somente apos curadoria;
- definir como disciplinas e concursos se associarao aos materiais na fase autorizada correspondente;
- manter as pendencias operacionais de producao ja registradas no Estado Atual.

## 21. Divergencias

Nao foi encontrada divergencia bloqueante entre Prompt Master, Manual Tecnico, Estado Atual e codigo.

A unica decisao de escopo foi nao criar tags genericas, pois o prompt as condiciona a justificativa e nao existe uso funcional nesta fase. Disciplinas e concursos foram mantidos dentro do modulo de categorias como catalogos estruturais coesos, evitando modulos e boilerplate sem ganho de dominio.

## 22. Git e secrets

- `backend/.env` e `frontend/.env` continuam ignorados;
- nenhum `.env` esta no Git ou historico;
- senha SMTP, segredo CSRF e senha real de teste: 0 ocorrencias nos arquivos versionaveis e historico;
- nenhum log persistido foi criado;
- branch de trabalho: `fase/03-estrutura-acervo`;
- `main` permanece intacta em `d842c15`;
- nenhum force push ou reescrita de historico;
- nenhum deploy.

## 23. Estado final

**PRONTA PARA VALIDACAO**

A Fase 3 esta pronta para revisao humana. Nao houve merge em `main`, deploy, inicio da Fase 4 ou integracao com Google Drive.

## 24. Revisao de UX apos validacao humana

Durante a validacao humana, a funcionalidade da Fase 3 foi aprovada, mas a interface foi considerada tecnica demais para usuarios leigos. Foi realizada uma correcao restrita ao frontend, sem alterar backend, banco, migrations, endpoints, regras de negocio, autenticacao, autorizacao ou seguranca.

Alteracoes realizadas:

- `Categoria` passou a ser apresentada como `Pasta` nos textos visiveis;
- `Categoria pai` passou a ser `Criar dentro de`;
- a area administrativa passou a usar o titulo `Organizar o acervo`;
- o perfil da conta passou a ser exibido como tipo de usuario em linguagem natural;
- a area do professor passou a usar `Pastas que voce pode gerenciar`;
- `Permissoes de professor` passou a ser `Acesso dos professores`;
- o admin agora seleciona um professor, marca as pastas desejadas e usa uma unica acao `Salvar acessos`;
- acoes de estado passaram a usar `Mostrar` e `Ocultar`;
- o campo numerico de ordem foi removido da interface, preservando internamente o contrato existente;
- formularios de pastas, disciplinas e concursos passaram a abrir somente quando solicitados;
- foram adicionadas acoes diretas como `+ Nova pasta`, `+ Adicionar disciplina` e `+ Adicionar concurso`;
- IDs, nomes internos e conceitos de banco continuam sem exposicao visual;
- mensagens de sucesso, erro e estados vazios foram simplificadas para linguagem cotidiana;
- o layout responsivo foi ajustado para os novos fluxos progressivos e para a selecao de pastas.

Validacao da correcao:

- arquivos alterados: somente `frontend/src/PainelAcervo.jsx` e `frontend/src/styles.css`;
- `npm run check`: 38 testes aprovados, 0 falhas;
- build Vite: aprovado, 26 modulos transformados;
- `git diff --check`: aprovado;
- smoke isolado: backend, HTML do frontend e modulo `PainelAcervo.jsx` responderam HTTP 200;
- nenhuma arrow function foi introduzida no frontend;
- nenhum termo tecnico alvo permaneceu nos elementos visiveis revisados;
- navegador integrado indisponivel, portanto a aprovacao visual final permanece para a nova validacao humana.

Estado apos a correcao: **PRONTA PARA NOVA VALIDACAO HUMANA**.
