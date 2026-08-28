# RELATORIO DA FASE 06 - GESTAO DE MATERIAIS

Data: 27/08/2026
Estado: **PRONTA PARA VALIDACAO HUMANA**

## 1. Resumo

A Fase 6 implementou upload, edicao, movimentacao, substituicao, lixeira, restauracao e exclusao administrativa de materiais. As operacoes estao protegidas por sessao, papel, CSRF, permissao de pasta, validacao de entrada, controle de concorrencia e compensacoes entre Google Drive e MySQL.

O OAuth foi ampliado conscientemente para o scope unico `https://www.googleapis.com/auth/drive`, a conta de teste foi reconectada e a nova credencial foi confirmada sem expor tokens. As operacoes foram validadas no Drive real exclusivamente com pasta, usuarios, categorias e arquivos temporarios criados pelo teste controlado da Fase 6. Nenhum arquivo legado foi alterado ou excluido.

Nao houve merge, deploy ou inicio da Fase 7.

## 2. Branch e commits

- Branch: `fase/06-gestao-materiais`.
- Implementacao tecnica inicial: `322315c` - `feat: prepara gestao segura de materiais da fase 6`.
- Registro da pausa para ampliacao OAuth: `1f9e28c`.
- Alteracao consciente do scope para gestao: `d7ba776`.
- Correcao da renderizacao do frontend: `07e0eba`.
- Validacao real, barreira da raiz e testes adicionais: `e6c8d5a` - `test: valida gestao real segura no google drive`.
- Documentacao de validacao consolidada na mesma branch.
- Nenhum merge em `main` foi realizado.

## 3. OAuth e escopo

O scope anterior `drive.readonly` nao permitia as operacoes da fase. O scope `drive.file` tambem nao atende de forma confiavel a arvore legada existente, pois limita o acesso aos arquivos criados ou escolhidos pela aplicacao.

O backend passou a solicitar exatamente:

`https://www.googleapis.com/auth/drive`

A credencial armazenada com o scope antigo e detectada como necessitando reconexao. A reconexao segura substitui a credencial anterior, mantem o refresh token criptografado no backend e nao envia tokens ao frontend ou aos logs.

O projeto OAuth continua em modo `Testing`. A autorizacao da conta de teste pode expirar aproximadamente a cada sete dias. Antes da producao, sera necessario publicar a configuracao OAuth e cumprir a verificacao aplicavel ao scope restrito `drive`, inclusive eventual avaliacao de seguranca exigida pelas politicas vigentes.

## 4. Operacoes implementadas

- upload resumivel e transmitido por stream para PDF, MP4/M4V e WebM;
- edicao de nome, disciplina e concurso por allowlist;
- renomeacao coerente no Drive e MySQL;
- movimentacao com validacao da origem e do destino;
- substituicao preservando o `materialId` e trocando o arquivo fisico com compensacao;
- envio para lixeira por professor autorizado ou admin;
- listagem e restauracao da lixeira somente por admin;
- exclusao definitiva somente por admin, com estado intermediario recuperavel;
- atualizacao imediata do MySQL, sem aguardar webhook ou sincronizacao.

## 5. Matriz de autorizacao

| Operacao | Aluno | Professor | Admin |
| --- | --- | --- | --- |
| Ler material | Sim | Sim | Sim |
| Adicionar | Nao | Somente pasta autorizada | Sim |
| Editar/renomear | Nao | Somente pasta autorizada | Sim |
| Mover | Nao | Origem e destino autorizados | Sim |
| Substituir | Nao | Somente pasta autorizada | Sim |
| Enviar para lixeira | Nao | Somente pasta autorizada | Sim |
| Ver/restaurar lixeira | Nao | Nao | Sim |
| Excluir definitivamente | Nao | Nao | Sim |

Toda decisao e refeita no backend. IDs recebidos do frontend nao sao usados como prova de autorizacao.

## 6. Seguranca e consistencia

- todas as pastas e arquivos sao revalidados no Drive como descendentes da pasta raiz configurada antes de qualquer escrita;
- a barreira recusa categoria local que aponte para uma pasta externa, mesmo para admin;
- origem e destino de movimentacao sao validados;
- arquivos temporarios locais sao removidos em sucesso ou falha;
- assinatura magica, extensao e MIME sao comparados;
- arquivo vazio, tipo proibido, tamanho excedido e nome inseguro sao recusados;
- DOCX, ODT, PNG e tipos genericos permanecem fora do escopo funcional;
- CSRF cobre todas as rotas mutaveis;
- SQL permanece parametrizado e mass assignment e recusado;
- falhas entre Drive e MySQL acionam compensacoes;
- versao otimista bloqueia alteracoes concorrentes;
- tokens Google e IDs do Drive nao chegam ao frontend ou aos logs.

## 7. Validacao real controlada

O comando `npm run test:drive:write` criou uma pasta temporaria unica dentro da raiz autorizada e executou pelas APIs reais do sistema:

- upload real de PDF por professor autorizado;
- bloqueio de upload por professor sem acesso;
- bloqueio de aluno;
- tentativa controlada de usar uma referencia externa a raiz, recusada antes de qualquer escrita externa;
- edicao e renomeacao reais;
- movimentacao real entre pastas autorizadas e bloqueio de destino sem permissao;
- substituicao real de PDF por video, preservando o `materialId`;
- envio real para lixeira e bloqueio imediato de leitura;
- restauracao real por admin;
- exclusao definitiva real somente do arquivo temporario.

Ao final, o teste removeu os arquivos, pastas, materiais, categorias, sessoes, permissoes e usuarios temporarios criados por ele. A ausencia de registros temporarios remanescentes foi confirmada no MySQL. Nenhum identificador do Drive, token ou credencial foi exibido.

## 8. Frontend

Professor e admin receberam uma area simples com `+ Adicionar material`, `Editar nome`, `Mover`, `Substituir arquivo` e `Enviar para lixeira`. O professor ve somente destinos gerenciaveis. O admin possui lixeira com restauracao e confirmacao forte antes da exclusao definitiva.

Durante a preparacao para reconectar o Drive, foi encontrado um erro de renderizacao causado pelo callback de listagem usar a referencia da funcao em vez do item atual. A correcao foi commitada em `07e0eba`; o build voltou a ser aprovado e o usuario conseguiu acessar o painel e concluir a reconexao.

## 9. Banco e endpoints

A migration `010_gestao_materiais.sql` adicionou estado de gestao, pasta anterior, autoria e data da lixeira, versao de concorrencia, indices, constraints e `auditoria_materiais`.

Endpoints autenticados em `/api/gestao-materiais`:

- `GET /pastas`;
- `POST /`;
- `PATCH /:materialId`;
- `PATCH /:materialId/mover`;
- `POST /:materialId/substituir`;
- `POST /:materialId/lixeira`;
- `GET /lixeira` - admin;
- `POST /:materialId/restaurar` - admin;
- `DELETE /:materialId` - admin.

## 10. Testes e checks

Resultado final automatizado: **88 testes aprovados, 0 falhas**.

- `npm run check`: aprovado, 88 testes e build Vite com 27 modulos;
- `npm audit`: 0 vulnerabilidades;
- `npm audit --omit=dev`: 0 vulnerabilidades;
- `git diff --check`: aprovado;
- `npm run test:drive:write`: aprovado com Drive real e limpeza confirmada;
- regressao das Fases 1 a 5: aprovada.

Os testes incluem escopo antigo exigindo reconexao, substituicao segura da credencial, ausencia de tokens no contrato publico, barreira da raiz, permissoes de professor e aluno, upload, edicao, movimentacao, substituicao, lixeira, restauracao, exclusao, compensacoes e concorrencia.

## 11. Secrets e limites

- `backend/.env` e `frontend/.env` permanecem ignorados;
- nenhum `.env` real foi versionado;
- nenhum client secret, refresh token, access token, senha SMTP ou senha de usuario foi adicionado ao Git;
- nenhuma credencial foi reproduzida neste relatorio;
- nenhuma operacao destrutiva foi executada em material legado;
- a validacao visual completa das telas permanece para o responsavel humano.

## 12. Estado final

**PRONTA PARA VALIDACAO HUMANA**

A implementacao, a reconexao OAuth, os testes reais temporarios e a regressao foram concluidos. A Fase 6 permanece somente na branch `fase/06-gestao-materiais`. Nao houve merge, deploy ou inicio da Fase 7.
