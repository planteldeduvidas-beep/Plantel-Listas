# RELATORIO DA FASE 05 - CONSULTA E ENTREGA DO ACERVO

Data: 27/08/2026
Estado: **PRONTA PARA VALIDACAO**

## 1. Resumo

A Fase 5 transformou os metadados indexados na Fase 4 em uma biblioteca utilizavel por aluno, professor e administrador. Foram implementados navegacao por pastas, breadcrumb, busca e filtros no MySQL, paginacao, classificacao por disciplina e concurso, visualizacao de PDF, reproducao de video com HTTP Range e download.

A entrega de arquivos segue obrigatoriamente `materialId -> MySQL -> disponibilidade e autorizacao -> drive_file_id interno -> Google Drive`. O frontend nao recebe nem envia ID de arquivo do Drive.

Tambem foi implementado o acompanhamento incremental pela Changes API, com estado persistido, deduplicacao de notificacoes, polling para recuperar notificacoes perdidas, webhook validado e sincronizacao completa como reconciliacao estrutural.

Nao foram implementados upload, edicao, movimentacao, substituicao, lixeira operacional, analytics, deploy ou Fase 6.

## 2. Branch e commits

- Branch: `fase/05-acervo`.
- Base: `main` no commit `ed968f5`.
- Commit tecnico: `2225fb9` - `feat: implementa consulta segura do acervo`.
- A documentacao de fechamento esta consolidada na mesma branch.
- Nenhum merge em `main` foi realizado.
- Nenhum deploy foi realizado.

## 3. Corpus real analisado

- 6.753 materiais disponiveis;
- 6.725 PDFs;
- 16 videos;
- 12 arquivos de outros tipos;
- 2.668 pastas vinculadas ao Drive;
- profundidade maxima de sete niveis;
- maior arquivo observado: 407.019.548 bytes.

Esses dados justificam paginacao no servidor, limite de 60 itens por pagina, filtros no MySQL e streaming. O frontend nunca carrega o catalogo inteiro nem o conteudo integral de videos grandes.

## 4. Navegacao, busca e filtros

- pastas e subpastas em cards simples;
- breadcrumb clicavel;
- 24 materiais por pagina no frontend;
- busca por nome do arquivo e caminho da pasta;
- filtros por tipo, disciplina e concurso;
- ordenacao restrita a uma allowlist: nome crescente, nome decrescente e mais recentes;
- SQL parametrizado;
- estados de carregamento, vazio e erro;
- nomes, tamanhos e tipos amigaveis, sem conceitos de banco ou IDs tecnicos.

Foram adicionados indices compostos para disponibilidade, pasta, tipo e nome, alem de indice FULLTEXT para o nome dos materiais. A consulta atual preserva busca parcial e por caminho com parametros seguros; o indice FULLTEXT fica disponivel para evolucao controlada se a medicao de producao justificar.

## 5. Classificacao

As pastas agora podem possuir disciplina e concurso proprios. A classificacao e herdada pelos descendentes e pode ser substituida manualmente pelo administrador.

A classificacao automatica foi limitada a nomes inequivocos observados no acervo real, como disciplinas explicitas sob `LISTAS` e concursos explicitos sob `PROVAS ANTIGAS`. Nao foi codificada a arvore inteira do Drive e nao houve inferencia baseada em nomes ambiguos.

Resultado inicial:

- 1.692 materiais classificados com alta confianca por heranca;
- 5.061 materiais mantidos como nao classificados para revisao humana.

O painel administrativo informa a quantidade pendente e permite identificar cada pasta com linguagem simples.

## 6. Seguranca dos arquivos

- sessao ativa obrigatoria para consulta, visualizacao e download;
- aluno, professor e admin possuem leitura conforme a matriz funcional atual;
- material inexistente, indisponivel ou dentro de pasta oculta retorna resposta controlada;
- nenhum endpoint aceita `driveFileId` do cliente;
- `drive_file_id` aparece somente em repository/service do backend;
- mass assignment, IDs invalidos e ordenacoes arbitrarias sao recusados;
- nomes de download removem caracteres perigosos, CR/LF e recebem `filename` e `filename*` seguros;
- respostas privadas usam `no-store` e `nosniff`;
- token de canal Google e redigido dos logs.

## 7. PDF, video e download

- PDF e entregue inline pelo backend;
- video usa o player nativo responsivo;
- download usa `Content-Disposition: attachment`;
- o backend transmite o corpo recebido do Drive por stream;
- nenhuma rota carrega o arquivo inteiro em memoria;
- `Range` simples e validado e encaminhado ao Drive;
- respostas `206`, `Content-Range`, `Content-Length` e `Accept-Ranges` sao preservadas;
- intervalos invalidos retornam HTTP 416 com `Content-Range: bytes */tamanho`.

No teste real nao destrutivo, um PDF e um video responderam com HTTP 206 e somente 1.024 bytes cada. Nenhum arquivo foi alterado, movido ou excluido no Drive.

## 8. Changes API e webhook

- `startPageToken` e o page token corrente ficam persistidos no MySQL;
- processamento e protegido por trava nomeada do MySQL;
- criacao, alteracao, renomeacao, movimentacao e remocao de arquivos sao aplicadas pelo ID do Drive;
- itens fora da pasta raiz ficam indisponiveis e nao sao importados;
- atalhos nao sao aceitos como caminho para escapar da raiz;
- mudancas em pastas acionam reconciliacao pela sincronizacao completa;
- page token expirado reinicia o acompanhamento e exige a reconciliacao de fallback;
- polling periodico permite recuperar notificacoes perdidas;
- webhook publico nao exige sessao nem CSRF, mas valida channel ID, resource ID, message number e hash do token do canal;
- notificacoes duplicadas sao ignoradas por chave unica;
- canal possui expiracao persistida e renovacao antes do vencimento;
- canal anterior e encerrado de forma best effort depois da substituicao;
- nenhum OAuth token ou token de canal chega ao frontend.

O webhook publico real nao foi criado porque a URL HTTPS de producao ainda nao foi definida. `GOOGLE_DRIVE_WEBHOOK_URL` e opcional, mas quando informada aceita somente a rota exata `/api/integracoes/google-drive/webhook` em HTTPS. A validacao local cobriu o contrato com mocks e banco real; a validacao do push real permanece para a fase de deploy autorizada.

Referencias oficiais consultadas:

- https://developers.google.com/workspace/drive/api/guides/push
- https://developers.google.com/workspace/drive/api/guides/manage-downloads
- https://developers.google.com/workspace/drive/api/reference/rest/v3/changes

## 9. Banco e migrations

`006_consulta_acervo.sql` adicionou classificacao de categorias, indices de consulta, catalogos iniciais de alta confianca e tabelas de estado, canais e notificacoes do Drive.

`007_changes_incrementais.sql` diferenciou sincronizacoes manuais e incrementais e adicionou o marcador persistido de reconciliacao.

As duas migrations foram aplicadas no MySQL local e no banco isolado de testes. O executor reconheceu as migrations aplicadas nas execucoes seguintes sem duplicacao.

## 10. Endpoints

Biblioteca autenticada:

- `GET /api/acervo`;
- `GET /api/acervo/materiais/:materialId/conteudo`;
- `GET /api/acervo/materiais/:materialId/download`;
- `PATCH /api/acervo/pastas/:categoriaId/classificacao` - somente admin e CSRF.

Atualizacoes do Drive:

- `POST /api/integracoes/google-drive/webhook` - publico e validado por canal;
- `GET /api/integracoes/google-drive/changes/status` - somente admin;
- `POST /api/integracoes/google-drive/changes/renovar` - somente admin e CSRF.

## 11. Testes

Resultado final: **64 testes aprovados, 0 falhas**.

Os dez testes adicionados cobrem:

- navegacao, breadcrumb, busca, filtros e paginacao;
- SQL injection e parametros fora da allowlist;
- sessao e perfis;
- CSRF e mass assignment na classificacao;
- ausencia de `driveFileId` no contrato publico;
- material indisponivel;
- PDF inline, download e nome seguro;
- Range 206 e intervalo invalido 416;
- webhook valido, invalido e duplicado;
- criacao incremental, item fora da raiz, mudanca estrutural, page token perdido e renovacao do canal.

Os 54 testes das Fases 1 a 4 permaneceram aprovados.

## 12. Checks finais

- `npm run check`: aprovado, 64 testes e build Vite com 27 modulos;
- `npm audit`: 0 vulnerabilidades;
- `npm audit --omit=dev`: 0 vulnerabilidades;
- `git diff --check`: aprovado;
- smoke HTTP: saude 200, frontend 200, catalogo autenticado 200;
- smoke real de video: 206, 1.024 bytes e `Accept-Ranges: bytes`;
- smoke real de PDF: 206, 1.024 bytes e `Content-Range`;
- estado da Changes API persistido e verificado sem erro.

O navegador integrado nao estava conectado. Por isso nao foi declarada validacao visual automatizada; o servidor Vite, o modulo React, o build e os contratos HTTP foram validados pelos meios disponiveis.

## 13. Secrets e limites externos

- `backend/.env` e `frontend/.env` continuam ignorados;
- nenhum `.env` real foi versionado;
- client secret, refresh token, access token, token de canal, senha SMTP e senhas de usuario nao foram adicionados ao Git;
- nenhum token foi enviado ao frontend ou reproduzido neste relatorio;
- o scope permanece exclusivamente `drive.readonly`;
- nenhum arquivo do Drive foi escrito ou excluido.

## 14. Pendencias para validacao humana

- navegar por diferentes profundidades de pasta;
- pesquisar e combinar filtros;
- abrir PDFs e videos representativos no navegador;
- testar seek e retomada em video local;
- baixar PDF, video e outro tipo de arquivo;
- revisar a experiencia responsiva e as classificacoes propostas;
- em producao, depois de URL e deploy autorizados, validar webhook HTTPS, renovacao real do canal e videos grandes sob os limites da Hostinger.

## 15. Estado final

**PRONTA PARA VALIDACAO**

A Fase 5 permanece somente na branch `fase/05-acervo`. Nao houve merge, deploy nem inicio da Fase 6.
