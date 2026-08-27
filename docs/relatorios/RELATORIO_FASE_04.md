# RELATORIO DA FASE 04 - GOOGLE DRIVE E INDEXACAO INICIAL

Data: 27/08/2026
Estado: **PRONTA PARA VALIDACAO**

## 1. Resumo

A Fase 4 implementou a integracao server-side com o Google Drive, a autorizacao OAuth 2.0 administrativa, o armazenamento protegido da credencial e a indexacao inicial dos metadados do acervo no MySQL. O fechamento tecnico desacoplou a indexacao longa da requisicao HTTP e adicionou acompanhamento persistido pelo painel.

O Drive permanece como armazenamento dos arquivos. O MySQL guarda somente a descricao necessaria para o sistema: identificadores do Drive, hierarquia, nomes, tipos, tamanhos, datas, checksums e estado de disponibilidade. Nenhum arquivo foi transferido, alterado, movido ou excluido.

Nao foram implementados upload de professor, edicao, movimentacao, substituicao, lixeira operacional, busca final, player, download final, analytics, deploy ou Fase 5.

## 2. Branch e commits

- Branch: `fase/04-google-drive`.
- Base: `main` no commit `ecc405a`.
- Commit tecnico inicial: `8bcf231` - `feat: prepara integracao segura com google drive`.
- Validacao real e relatorio: `2476aef` - `docs: conclui validacao real da fase 4`.
- Ajuste de formatacao: `bafb357` - `docs: ajusta formatacao do relatorio da fase 4`.
- A sincronizacao assincrona, a renovacao OAuth e a presente atualizacao documental ficam no commit tecnico seguinte da branch.
- Nenhum merge em `main` foi realizado.
- Nenhum deploy foi realizado.

## 3. Implementacao

Foram criados:

- migration `004_google_drive.sql`;
- provider isolado `googleDriveProvider`;
- controller, repository, routes, service e validator da integracao no modulo de materiais;
- testes de integracao e testes unitarios do provider;
- painel administrativo para conectar e sincronizar o acervo;
- worker local simples para executar a sincronizacao depois da resposta HTTP;
- polling do status persistido no painel administrativo;
- este relatorio.

Foram alterados a configuracao de ambiente, o registro de modulos da API, a sanitizacao de logs, a limpeza dos bancos de teste, o frontend administrativo, o lockfile e a documentacao de estado.

## 4. Dependencia

Foi adicionada `google-auth-library` 11.0.2 para o fluxo OAuth 2.0 oficial. As consultas de metadados usam o `fetch` nativo do Node.js, evitando instalar o cliente completo `googleapis` e suas dependencias adicionais.

O pacote possui uma dependencia transitiva marcada como deprecated, mas as auditorias npm de desenvolvimento e producao encerraram com zero vulnerabilidades conhecidas.

## 5. OAuth 2.0

- fluxo web server-side;
- redirect local exato: `http://localhost:3000/api/integracoes/google-drive/oauth/callback`;
- acesso offline com refresh token;
- scope unico: `https://www.googleapis.com/auth/drive.readonly`;
- estado OAuth aleatorio, persistido somente como hash, com expiracao de dez minutos e uso unico;
- callback exige a sessao administrativa que iniciou o fluxo;
- refresh token criptografado com AES-256-GCM antes de ser persistido;
- chave derivada do segredo da aplicacao por HKDF;
- refresh token invalido, expirado ou revogado marca a conexao como necessitando renovacao;
- nova autorizacao OAuth substitui a credencial anterior e limpa o estado de invalidacao;
- tokens Google nunca sao enviados ao frontend;
- codigo e estado OAuth sao removidos das URLs registradas nos logs.

A URL de producao nao foi inventada porque o subdominio final ainda nao foi definido. Ela devera ser cadastrada exatamente quando a URL oficial for aprovada.

## 6. Acesso ao Drive

O provider valida a pasta raiz configurada e percorre somente seus descendentes. A listagem e paginada, ordenada e identifica cada item pelo Google Drive file ID, nunca somente pelo nome.

Somente requisicoes HTTP `GET` foram implementadas. Nao existem metodos de criacao, upload, alteracao, movimentacao ou exclusao no provider.

Atalhos do Drive nao sao seguidos como pastas, evitando escapar da arvore autorizada por meio de um shortcut.

## 7. Migration e modelagem

A migration criou:

- `estados_oauth_google_drive` para protecao do handshake OAuth;
- `credenciais_google_drive` para a credencial criptografada;
- `sincronizacoes_google_drive` para estado, autoria e resumo das execucoes;
- `materiais` para metadados dos arquivos;
- colunas de vinculacao e ultima sincronizacao em `categorias`.

A migration complementar `005_sincronizacao_assincrona.sql` adicionou os estados `aguardando` e `sincronizando`, o instante da solicitacao e o marcador persistido de renovacao da credencial Google. Registros anteriores em `em_andamento` foram convertidos para `sincronizando`.

O `drive_file_id` de material e o `drive_pasta_id` de categoria possuem unicidade. Foreign keys preservam a relacao com usuarios, categorias, disciplinas, concursos e sincronizacoes.

## 8. Sincronizacao

- exclusiva de administrador autenticado;
- exige CSRF e corpo vazio;
- `POST /sincronizar` cria uma execucao `aguardando` e responde imediatamente com HTTP 202;
- worker local assume a execucao em segundo plano e muda o estado para `sincronizando`;
- frontend consulta `GET /status` periodicamente ate `concluida` ou `falhou`;
- usa travas nomeadas do MySQL no agendamento e na execucao para impedir concorrencia;
- le toda a arvore antes da gravacao;
- aplica os metadados em transacao;
- cria ou atualiza pelo ID do Drive;
- reconhece renomeacoes sem duplicar registros;
- marca como indisponiveis itens ausentes em uma leitura posterior, sem apagar historico;
- registra somente contagens e codigos operacionais seguros;
- no inicio do servidor, execucoes deixadas em `aguardando` ou `sincronizando` sao encerradas como `falhou` com codigo controlado de interrupcao;
- consultas ao Google possuem limite de tempo para evitar espera indefinida em uma unica chamada externa.

Os estados publicos simples sao: `aguardando`, `sincronizando`, `concluida` e `falhou`.

## 9. Endpoints

Todos os endpoints ficam sob `/api/integracoes/google-drive`, exigem sessao administrativa e usam `Cache-Control: no-store`:

- `GET /status`;
- `POST /oauth/iniciar`;
- `GET /oauth/callback`;
- `POST /sincronizar`.

As duas rotas `POST` exigem token CSRF. O callback usa a protecao de estado OAuth vinculada ao administrador e nao recebe token CSRF por ser o retorno externo padrao do provedor. O inicio da sincronizacao responde HTTP 202 sem manter a conexao aberta durante a leitura do acervo.

## 10. Validacao real do OAuth

A configuracao foi realizada no Google Cloud sem expor client ID, client secret, pasta raiz ou tokens. O fluxo foi executado manualmente no navegador:

- administrador autenticado iniciou a conexao;
- conta Google autorizou o scope de leitura;
- callback local foi aceito;
- aplicacao retornou ao frontend;
- painel confirmou `Google Drive conectado`;
- credencial criptografada foi localizada no banco;
- nenhum token chegou ao frontend ou aos logs.

## 11. Indexacao real do acervo

A primeira sincronizacao real foi concluida com:

- 2.668 pastas encontradas;
- 6.753 arquivos encontrados;
- 6.753 materiais criados;
- 0 materiais atualizados;
- 0 itens indisponiveis;
- duracao registrada: 593 segundos.

Foram persistidos 6.753 materiais disponiveis e 2.668 pastas ativas vinculadas ao Drive. Nao foi copiado o conteudo de nenhum arquivo.

## 12. Idempotencia real

A sincronizacao foi repetida sobre o mesmo acervo:

- 2.668 pastas encontradas;
- 6.753 arquivos encontrados;
- 0 materiais criados;
- 6.753 materiais atualizados;
- 0 itens indisponiveis;
- duracao registrada: 588 segundos.

O banco permaneceu com exatamente 6.753 materiais e 6.753 IDs de arquivo distintos, alem de 2.668 pastas e 2.668 IDs de pasta distintos. Nao restou sincronizacao em andamento.

## 13. Validacao manual e ajuste de UX

Durante a primeira indexacao, a pagina foi atualizada. O backend continuou corretamente sob a trava exclusiva, mas o frontend apresentava a execucao `em_andamento` como `nao concluida`, dando a impressao de interrupcao.

O frontend foi ajustado para:

- mostrar `aguardando inicio` e `em andamento` conforme o estado real;
- manter o botao como `Sincronizando...`;
- impedir novo clique enquanto a execucao estiver ativa;
- consultar o status a cada tres segundos sem bloquear a navegacao;
- atualizar a estrutura ao concluir;
- informar falha e solicitar reconexao quando a autorizacao Google for invalidada;
- oferecer a acao `Reconectar Google Drive`.

Nenhuma operacao de escrita no Drive foi adicionada.

O novo contrato assincrono foi validado com worker controlado nos testes e smoke do servidor local. Nao foi executada uma terceira leitura completa do Drive real, evitando uma nova varredura desnecessaria; os 6.753 materiais e as 2.668 pastas da validacao real anterior permaneceram intactos.

## 14. Seguranca

- secrets permanecem somente no `backend/.env`, ignorado pelo Git;
- `.env.example` contem apenas nomes de variaveis e redirect local nao secreto;
- refresh token e criptografado e nunca retornado pelas APIs;
- token de acesso existe somente em memoria durante consultas ao Google;
- logs redigem headers e campos sensiveis e removem query strings;
- SQL usa parametros;
- mass assignment e recusado pelos validators de corpo vazio;
- CORS, sessao, role admin, CSRF, rate limit e tratamento de erros anteriores foram preservados;
- nenhuma operacao de escrita no Drive foi implementada.

## 15. Testes automatizados

Comando final: `npm run check`.

Resultado: **54 testes aprovados, 0 falhas**, seguidos de build Vite aprovado com 26 modulos transformados.

Os testes especificos e ampliados para a Fase 4 cobrem:

- migration, engines, indices e constraints;
- exclusividade de admin, CSRF e mass assignment;
- estado OAuth com hash, uso unico e protecao contra replay;
- refresh token criptografado;
- escopo unico de leitura e autorizacao offline;
- paginacao e percurso limitado a descendentes da raiz;
- importacao por Drive ID e idempotencia;
- renomeacao e indisponibilidade logica;
- trava contra sincronizacoes concorrentes;
- resposta 202 desacoplada da execucao;
- transicoes entre `aguardando`, `sincronizando`, `concluida` e `falhou`;
- recuperacao de execucao interrompida no reinicio;
- refresh token invalido ou revogado e indicacao de renovacao;
- reconexao OAuth com substituicao segura da credencial anterior;
- remocao de codigo e estado OAuth dos logs.

## 16. Regressao

Os testes das Fases 1, 2 e 3 permaneceram aprovados, incluindo saude, erros, configuracao, cadastro, login, sessoes, roles, cookies, CSRF, rate limit, recuperacao de senha, SMTP, estrutura do acervo e permissoes de professor.

## 17. Checks finais

- `npm run check`: aprovado;
- `npm audit`: 0 vulnerabilidades;
- `npm audit --omit=dev`: 0 vulnerabilidades;
- `git diff --check`: aprovado;
- build React/Vite: aprovado;
- migration aplicada e segunda execucao reconhecida sem duplicacao.

## 18. Secrets e Git

- `backend/.env` e `frontend/.env` continuam ignorados;
- nenhum arquivo `.env` foi versionado;
- client secret, senha SMTP, refresh token, access token e senhas de usuario nao foram adicionados ao Git;
- nenhum valor secreto e reproduzido neste relatorio;
- a branch `main` permanece no commit aprovado da Fase 3.

## 19. Erros encontrados e corrigidos

- a primeira execucao de teste da migration revelou comparacao de horario inconsistente entre JavaScript e MySQL; expiracao e consumo do estado OAuth passaram a usar `CURRENT_TIMESTAMP(3)` integralmente no banco;
- a dependencia `googleapis` adicionava superficie desnecessaria e foi substituida por `google-auth-library` com `fetch` nativo antes do commit;
- a atualizacao da pagina durante a indexacao ocultava o indicador local; o texto e o bloqueio do botao passaram a refletir os estados persistidos da execucao;
- a requisicao HTTP permanecia aberta durante toda a indexacao real; o processamento passou para um worker local iniciado depois da resposta 202;
- execucoes interrompidas poderiam permanecer indefinidamente como ativas; a inicializacao do servidor agora as encerra com falha controlada antes de aceitar novo trabalho;
- credencial Google revogada era tratada apenas como falha generica; o banco e o painel agora indicam renovacao e a reconexao substitui a credencial anterior.

## 20. Erros abertos e riscos

Nenhum erro de codigo, banco, OAuth, indexacao, teste, build ou dependencia permanece aberto.

Riscos operacionais:

- o acervo real possui milhares de pastas e cada execucao completa levou cerca de dez minutos no ambiente local, mas esse tempo nao mantem mais a requisicao HTTP aberta;
- uma otimizacao futura pode avaliar concorrencia limitada e retentativas com backoff, respeitando quotas da API;
- o worker e intencionalmente local e sem infraestrutura adicional; em eventual operacao com multiplas instancias, as travas MySQL continuam sendo obrigatorias;
- a URL e as credenciais de producao ainda dependem da definicao do subdominio e da fase de deploy;
- alteracoes reais no Drive entre duas leituras podem modificar contagens, como esperado em uma sincronizacao;
- o scope `drive.readonly` permite leitura do Drive autorizado, enquanto a limitacao a pasta raiz e garantida pelo provider da aplicacao.

## 21. Pendencias

- validacao humana da Fase 4;
- definir URL/subdominio final e redirect URI de producao;
- validar OAuth e indexacao no ambiente Hostinger somente quando o deploy for autorizado;
- manter tokens e secrets nas variaveis protegidas do ambiente de producao;
- decidir eventual otimizacao de desempenho como backlog, sem ampliar o escopo atual.

## 22. Regra obrigatoria para a Fase 5

O frontend nunca devera enviar um `driveFileId` arbitrario para visualizar ou baixar arquivos.

O fluxo obrigatorio sera:

`materialId` enviado pelo frontend -> consulta no MySQL -> validacao de disponibilidade e autorizacao -> obtencao interna do `drive_file_id` -> acesso ao Google Drive.

Essa regra impede que um identificador do Drive fornecido pelo cliente contorne o catalogo e as permissoes da aplicacao. Download e player nao foram implementados nesta fase.

## 23. Estado final

**PRONTA PARA VALIDACAO**

A Fase 4 permanece somente na branch `fase/04-google-drive`. Nao houve merge, deploy ou inicio da Fase 5.
