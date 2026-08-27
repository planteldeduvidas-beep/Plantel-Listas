# RELATORIO DA FASE 06 - GESTAO DE MATERIAIS

Data: 27/08/2026
Estado: **NAO PRONTA - AGUARDANDO AMPLIACAO OAUTH E TESTE REAL CONTROLADO**

## 1. Resumo

A preparacao tecnica da Fase 6 implementou upload, edicao, movimentacao, substituicao, lixeira, restauracao e exclusao administrativa de materiais. As operacoes estao protegidas por sessao, papel, CSRF, permissao de pasta, validacao de entrada, controle de concorrencia e compensacoes entre Google Drive e MySQL.

O codigo esta na branch `fase/06-gestao-materiais`, no commit tecnico `322315c` (`feat: prepara gestao segura de materiais da fase 6`). Nao houve merge, deploy ou inicio da Fase 7.

A autorizacao real ainda permanece em `drive.readonly`. O backend bloqueia qualquer escrita com resposta controlada ate que o scope seja alterado conscientemente e a conta seja reconectada. Nenhuma escrita real foi executada no Drive nesta etapa.

## 2. Analise do menor scope OAuth

O scope atual `https://www.googleapis.com/auth/drive.readonly` permite leitura, mas nao permite as operacoes da Fase 6.

O scope `https://www.googleapis.com/auth/drive.file` foi avaliado e nao e suficiente para o acervo existente. Ele permite acesso por arquivo aos itens criados ou abertos/compartilhados com a aplicacao e e apropriado quando o usuario escolhe arquivos por mecanismos como Google Picker. Ele nao concede de forma confiavel a gestao da arvore legada ja existente e indexada pelo Plantel Listas.

O menor scope funcional para upload, renomeacao, movimentacao, substituicao, lixeira, restauracao e exclusao sobre todo o acervo legado autorizado e:

`https://www.googleapis.com/auth/drive`

Esse scope e classificado pelo Google como restrito. A concessao OAuth e ampla para os arquivos da conta; a limitacao a pasta raiz continua sendo responsabilidade obrigatoria do backend. Antes da producao, o aplicativo devera passar pela verificacao aplicavel a scopes restritos e, por armazenar metadados e transmitir conteudo do Drive no servidor, pode ficar sujeito a avaliacao de seguranca independente periodica conforme a politica vigente.

Fontes oficiais:

- https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
- https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance

## 3. Operacoes implementadas

- upload resumivel e transmitido por stream para PDF, MP4/M4V e WebM;
- edicao de nome, disciplina e concurso por allowlist;
- renomeacao coerente no Drive e MySQL;
- movimentacao com validacao da origem e do destino;
- substituicao preservando o `materialId` e trocando o arquivo fisico de forma compensavel;
- envio para lixeira por professor autorizado ou admin;
- listagem e restauracao da lixeira somente por admin;
- exclusao definitiva somente por admin, com estado intermediario recuperavel;
- atualizacao imediata do MySQL, sem aguardar webhook ou sincronizacao.

Na substituicao, foi priorizada a seguranca de compensacao: um novo arquivo e criado, o anterior e enviado para a lixeira e o mesmo `materialId` passa a apontar para o novo arquivo. Preservar o Drive file ID por sobrescrita direta dificultaria restaurar o conteudo anterior diante de falha parcial. O frontend nunca recebe nenhum desses IDs.

## 4. Matriz de autorizacao

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

Toda decisao e refeita no backend por usuario, material e hierarquia de pastas. IDs recebidos do frontend nao sao usados como prova de autorizacao.

## 5. Upload e seguranca

- arquivos temporarios ficam fora do repositorio e sao removidos em sucesso ou falha;
- videos nao sao carregados integralmente em memoria;
- limites separados e configuraveis para PDF e video;
- rate limit especifico para upload e substituicao;
- assinatura magica, extensao e MIME informado pelo navegador sao comparados;
- arquivo vazio, tipo proibido, MIME incompatível, extensao divergente e nome inseguro sao recusados;
- DOCX, ODT, PNG e tipos genericos continuam fora do escopo funcional;
- CSRF cobre todas as rotas mutaveis;
- SQL permanece parametrizado e mass assignment e recusado;
- tokens Google e IDs do Drive nao chegam ao frontend ou aos logs.

## 6. Consistencia Drive e MySQL

- Drive e alterado antes da confirmacao no MySQL quando a operacao exige escrita externa;
- se o banco falha apos upload, o arquivo novo e excluido como compensacao;
- se o banco falha apos renomeacao ou movimentacao, o Drive e revertido;
- substituicao restaura o arquivo anterior e remove o novo quando o banco falha;
- falha do Drive impede alteracao do MySQL;
- token revogado marca a conexao como necessitando renovacao;
- versao otimista do material bloqueia alteracoes concorrentes;
- exclusao definitiva usa `exclusao_pendente` e pode ser retomada com seguranca se a confirmacao local falhar;
- webhook ou Changes API posterior preserva lixeira e exclusao, evitando desfazer a operacao local.

## 7. Banco e endpoints

A migration `010_gestao_materiais.sql` adicionou estado de gestao, pasta anterior, autoria/data da lixeira, versao de concorrencia, indices, constraints e `auditoria_materiais`.

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

## 8. Frontend

Professor e admin receberam uma area simples com:

- `+ Adicionar material`;
- `Editar nome`;
- `Mover`;
- `Substituir arquivo`;
- `Enviar para lixeira`.

O professor ve como destino somente pastas gerenciaveis e as acoes aparecem apenas nos materiais de suas pastas. O admin possui lixeira com restauracao e confirmacao forte por digitacao antes da exclusao definitiva. Nenhum conceito de Drive, MIME, banco, endpoint ou scope e exibido.

O build e o smoke HTTP local foram aprovados: API 200 e frontend Vite 200. O navegador integrado nao estava conectado, portanto a validacao visual automatizada nao foi declarada.

## 9. Testes e checks

Resultado atual: **86 testes aprovados, 0 falhas**.

Foram cobertos PDF, video, tipo proibido, MIME incompatível, tamanho, nome, aluno, professor autorizado e nao autorizado, admin, CSRF, mass assignment, IDOR, origem/destino, caminho e classificacao herdada apos movimentacao, substituicao PDF/video, identidade logica, lixeira, restauracao, exclusao de material temporario simulado, erro Google, erro MySQL, compensacao, token revogado, concorrencia e notificacao posterior idempotente.

- `npm run check`: aprovado, com 86 testes e build Vite;
- `npm audit`: 0 vulnerabilidades;
- `npm audit --omit=dev`: 0 vulnerabilidades;
- `git diff --check`: aprovado;
- regressao das Fases 1 a 5: aprovada.

## 10. Secrets e limites da validacao

- `backend/.env` e `frontend/.env` permanecem ignorados e nunca apareceram no historico;
- nenhum `.env` real foi versionado;
- ocorrencias de tokens nos testes sao valores artificiais e identificados como teste;
- nenhum secret real foi adicionado ao Git, ao relatorio ou aos logs;
- nenhuma operacao real de escrita foi feita no Drive;
- nenhuma exclusao de material legado foi realizada;
- o teste real com pasta e arquivos temporarios depende da nova autorizacao OAuth.

## 11. Acao humana necessaria agora

No mesmo projeto do Google Cloud usado pelo Plantel Listas:

1. abrir **Google Auth Platform**;
2. entrar em **Data Access**;
3. escolher **Add or remove scopes**;
4. adicionar exatamente `https://www.googleapis.com/auth/drive`;
5. salvar a configuracao;
6. manter a conta usada na validacao como usuario de teste enquanto o aplicativo estiver em `Testing`;
7. nao enviar client secret, refresh token ou qualquer outra credencial ao Codex;
8. informar apenas que a configuracao esta pronta.

A redirect URI nao muda nesta etapa. Depois dessa confirmacao, o backend sera alterado para solicitar exatamente o novo scope e o administrador devera usar a reconexao segura no painel para conceder a nova autorizacao. Somente entao serao executados testes reais, exclusivamente em pasta e arquivos temporarios comprovadamente criados para a Fase 6.

## 12. Estado final desta etapa

**NAO PRONTA**

A implementacao local e os testes com mocks estao aprovados, mas a Fase 6 aguarda ampliacao consciente do OAuth, reconexao, testes reais temporarios e validacao humana. Nao houve merge, deploy ou inicio da Fase 7.
