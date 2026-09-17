# RELATORIO DAS CORRECOES DE CONSISTENCIA PRE-DEPLOY

Data: 17/09/2026  
Branch: `fase/09-qa-producao`  
Commit de partida: `a9de5637fb06f7d83ac8e9acb1e3c6e27f50b119`  
Estado: **AINDA EXISTEM BLOQUEIOS**

## 1. Resumo executivo

Foram implementadas e testadas as dez correcoes bloqueantes apontadas pela auditoria de transacoes, atomicidade e consistencia. A implementacao distingue falha anterior ao commit, commit confirmado e resultado de commit desconhecido; adiciona journal persistente e retomada das operacoes Google Drive; torna a exclusao permanente idempotente; coordena papeis, sessoes, permissoes e auditoria; protege login contra redefinicao concorrente; garante consumo da reconciliacao do Drive; corrige cleanup de named lock; serializa alteracoes da hierarquia; e recusa pool com somente uma conexao.

A migration 014 foi aprovada em banco limpo, em schema equivalente ao existente com registro legado e, depois de autorizacao expressa, aplicada ao banco local configurado em `backend/.env`. Nenhuma operacao destrutiva foi executada no Google Drive real.

Toda a suite funcional passou: **123 testes backend**, sem falhas, e build Vite com **32 modulos transformados**.

O fechamento encontrou vulnerabilidades altas em `multer@2.2.0` e `nodemailer@9.0.5`. Depois de autorizacao expressa, elas foram corrigidas com `multer@2.4.0` e `nodemailer@9.1.1`; os audits e todos os testes passaram novamente.

Permanece um bloqueio independente: o arquivo rastreado `.env.example`, ja modificado antes desta implementacao, contem dois valores de alta entropia com aparencia de secrets, em vez de placeholders. Essa mudanca preexistente nao foi sobrescrita para nao destruir trabalho do responsavel.

## 2. Problemas corrigidos

1. O retorno de criacao/alteracao de material passou a ser lido na mesma transacao, antes do commit. Nao existe mais o padrao `COMMIT` seguido de `SELECT` pelo pool capaz de disparar compensacao externa indevida.
2. O executor transacional marca falha anterior ao commit como `nao_confirmado` e falha durante o commit como `desconhecido`. Resultado desconhecido nunca dispara compensacao automatica.
3. Foi criado journal duravel das operacoes Drive, com fase, detalhes minimos, tentativas, proxima tentativa, erro e conclusao.
4. Upload e substituicao recebem uma chave de operacao em `appProperties`, permitindo localizar arquivo criado mesmo quando a resposta do Drive se perde.
5. Exclusao permanente aceita Drive 404 como sucesso idempotente e retoma `exclusao_pendente`. A marcacao local, auditoria e criacao do journal ocorrem na mesma transacao.
6. Alteracao de papel/estado, revogacao de sessoes, remocao de permissoes incompatíveis e auditoria usam uma unica conexao/transacao.
7. Alteracao de papel e concessao de permissao compartilham a mesma named lock por banco e bloqueiam as linhas verificadas.
8. Sessoes registram a geracao da credencial. Login so cria sessao se hash, geracao e estado do usuario ainda forem os observados; redefinicao e mudancas administrativas incrementam a geracao.
9. A flag persistente `reconciliacao_necessaria` agenda full sync mesmo sem nova mudanca casual, e so e limpa junto da conclusao confirmada da sincronizacao.
10. Falha durante `GET_LOCK` da Changes API libera a conexao.
11. Criacao, edicao, movimento e ativacao de categorias executam validacao e mutacao dentro da mesma transacao, sob named lock da hierarquia.
12. `DB_CONNECTION_LIMIT=1` e rejeitado no startup; o minimo passou a ser 2.
13. Dependencias vulneraveis de upload e e-mail foram atualizadas para versoes corrigidas e o lockfile foi regenerado.

### Vulnerabilidades corrigidas

#### Multer

Motivo: a versao `2.2.0` estava abrangida por quatro advisories altos relacionados a nomes multipart malformados, indice de array excessivo, vazamento de descritor em upload abortado e corrida capaz de contornar limite de tamanho no `fileFilter` assincrono.

Correcao: atualizacao para `multer@2.4.0`, ajuste da versao minima no manifesto e regeneracao do `package-lock.json`. A nova arvore tambem removeu dependencias transitivas que deixaram de ser necessarias (`concat-stream`, `readable-stream`, `buffer-from`, `string_decoder`, `typedarray` e `util-deprecate`).

Se nao fosse corrigido: requisicoes multipart especialmente construidas poderiam consumir CPU/memoria, manter descritores abertos, causar indisponibilidade e, em determinados fluxos com filtro assincrono, ultrapassar o limite esperado do upload. Como o sistema possui upload de materiais, o parser faz parte da superficie real de entrada, mesmo com autenticacao e controles adicionais.

#### Nodemailer

Motivo: a versao `9.0.5` estava abrangida por quatro advisories altos relacionados ao parser de enderecos, dominios IDN/Punycode, comentarios RFC 5322 e acesso a arquivo/URL na assinatura legada de `resolveContent()`.

Correcao: atualizacao para `nodemailer@9.1.1`, ajuste da versao minima no manifesto e regeneracao do lockfile.

Se nao fosse corrigido: dependendo do caminho de API utilizado, entradas de endereco especialmente construidas poderiam causar processamento quadratico e indisponibilidade, contornar validacoes de dominio/destinatario ou explorar leitura de arquivo/URL em chamadas vulneraveis. A configuracao atual reduz parte da exposicao ao definir destinatarios sensiveis no backend, mas manter uma versao conhecida como vulneravel seria inadequado antes da producao.

## 3. Arquivos alterados

Codigo de aplicacao:

- `backend/src/app.js`;
- `backend/src/server.js`;
- `backend/src/shared/config/ambiente.js`;
- `backend/src/shared/providers/googleDriveProvider.js`;
- `backend/src/modules/auditoria/auditoriaRepository.js`;
- `backend/src/modules/autenticacao/autenticacaoRepository.js`;
- `backend/src/modules/autenticacao/autenticacaoService.js`;
- `backend/src/modules/categorias/estruturaAcervoRepository.js`;
- `backend/src/modules/categorias/estruturaAcervoService.js`;
- `backend/src/modules/materiais/gestaoMateriaisRepository.js`;
- `backend/src/modules/materiais/gestaoMateriaisService.js`;
- `backend/src/modules/materiais/googleDriveChangesRepository.js`;
- `backend/src/modules/materiais/googleDriveChangesService.js`;
- `backend/src/modules/materiais/integracaoGoogleDriveRepository.js`;
- `backend/src/modules/materiais/integracaoGoogleDriveService.js`;
- `backend/src/modules/permissoes/permissaoRepository.js`;
- `backend/src/modules/permissoes/permissaoService.js`;
- `backend/src/modules/usuarios/usuarioRepository.js`;
- `backend/src/modules/usuarios/usuarioService.js`.

Dependencias:

- `backend/package.json`;
- `package-lock.json`.

Testes:

- `backend/test/ambiente.test.js`;
- `backend/test/gestaoMateriais.integracao.test.js`;
- `backend/test/gestaoMateriaisService.test.js`;
- `backend/test/googleDriveChanges.test.js`;
- `backend/test/concorrenciaOperacoesMutaveis.integracao.test.js`;
- `backend/test/consistenciaOperacoesMutaveis.test.js`.

## 4. Migration criada

Foi criada `backend/migrations/014_consistencia_operacoes_mutaveis.sql`, que:

- cria `operacoes_google_drive_pendentes`;
- adiciona `usuarios.versao_sessao` com default 1;
- adiciona `sessoes.usuario_versao` com default 1 e indice correspondente.

Validacoes executadas:

- migrations 001 a 014 em banco limpo: aprovadas;
- migration 014 sobre schema 001 a 013 com usuario legado: aprovada, preservando geracao 1;
- banco local configurado: migration 014 aplicada e verificada quanto ao registro de migration, tabela e colunas novas.

Como o MySQL pode confirmar DDL implicitamente, nao se declara rollback fisico transacional da migration. A recuperacao funcional das operacoes pendentes foi testada separadamente.

## 5. Estrategia de consistencia Drive e MySQL

O Drive continua sendo o armazenamento fisico e o MySQL a fonte do estado funcional. A estrategia adotada foi:

- journal antes da mutacao externa ou, na exclusao, journal atomico com a transicao local para `exclusao_pendente`;
- registro da confirmacao conhecida do Drive;
- alteracao local e auditoria na mesma transacao;
- conclusao do journal dentro da transacao local sempre que ela confirma o estado funcional;
- compensacao somente quando o banco certamente nao confirmou;
- nenhuma compensacao quando o resultado do commit e desconhecido;
- reconciliacao posterior usando o estado confirmado no MySQL como autoridade funcional;
- chave de operacao no Drive para resolver upload/substituicao com resposta perdida.

## 6. Retry e reconciliacao

Operacoes nao concluidas possuem tentativas, erro e `proxima_tentativa_em`. O worker:

- roda na inicializacao e periodicamente;
- usa a mesma named lock das mutacoes/sincronizacoes do Drive;
- processa no maximo 25 operacoes por ciclo;
- trata exclusao ausente no Drive como concluida;
- reaplica renomeacao, movimento e estado de lixeira conforme o MySQL;
- restaura o arquivo antigo ou elimina o novo em substituicao nao confirmada localmente;
- localiza uploads pelo identificador da operacao quando a resposta externa foi perdida;
- mantem pendencia e backoff quando a reconciliacao falha;
- nao impede o servidor de iniciar se o Drive estiver temporariamente indisponivel.

A reconciliacao estrutural da Changes API permanece persistente: a flag so e limpa quando o full sync termina e o monitor tenta consumi-la novamente depois de restart.

## 7. Mudancas em transacoes

- Material, auditoria, leitura de retorno e conclusao do journal usam a mesma conexao antes do commit.
- `estadoCommit` distingue `nao_confirmado` de `desconhecido`.
- Papel/estado, sessoes, permissoes incompatíveis e auditoria administrativa formam uma unidade.
- Concessao individual e lote de permissoes incluem validacoes, escrita e auditoria na unidade protegida.
- Redefinicao de senha incrementa geracao, consome tokens e revoga sessoes na mesma transacao.
- Hierarquia executa validacoes e mutacoes na mesma transacao.
- Conclusao do full sync e limpeza de `reconciliacao_necessaria` sao atomicas.

## 8. Concorrencia e locking

- Mutacoes do Drive, full sync, Changes API e retry compartilham `plantel_drive_operacao_<banco>`.
- Papel e permissoes compartilham `plantel_admin_usuarios_<banco>`.
- Hierarquia usa `plantel_hierarquia_<banco>` e bloqueio das linhas de categoria.
- As named locks sao liberadas em `finally`; falha no proprio `GET_LOCK` tambem libera a conexao.
- O pool minimo de duas conexoes evita autobloqueio do fluxo que reserva conexao para named lock.

## 9. Testes criados ou ampliados

Foram cobertos:

- retorno lido antes do commit;
- commit com resultado desconhecido, sem rollback/compensacao enganosa;
- falha do Drive sem alteracao local;
- falha de compensacao persistida;
- journal da exclusao na mesma transacao de `exclusao_pendente`;
- retry de renomeacao e exclusao permanente com arquivo ja ausente;
- concorrencia papel versus permissao;
- login versus redefinicao de senha;
- reconciliacao persistente depois de liberar named lock;
- excecao em `GET_LOCK` com release da conexao;
- movimentos concorrentes de categoria sem ciclo;
- rejeicao de pool com uma conexao;
- fluxos funcionais existentes de materiais, autenticacao, administracao e Drive simulado.

Os testes direcionados terminaram com **23/23 aprovados**.

## 10. Resultado de toda a suite

- `npm run check`: aprovado;
- backend: **123 testes aprovados, 0 falhas**;
- frontend: build Vite aprovado, **32 modulos transformados**;
- `node --check` nos arquivos JavaScript alterados: aprovado;
- `git diff --check`: aprovado;
- operacoes destrutivas no Drive real: nenhuma.

Verificacao de dependencias depois da correcao:

- instalados: `multer@2.4.0` e `nodemailer@9.1.1`;
- testes direcionados de upload, SMTP e Drive simulado: **26 aprovados, 0 falhas**;
- `npm audit`: **0 vulnerabilidades**;
- `npm audit --omit=dev`: **0 vulnerabilidades**.

## 11. Riscos residuais

Bloqueante:

1. `.env.example` possui mudanca preexistente com dois valores de alta entropia semelhantes a secrets. E necessario confirmar se sao reais, remove-los do arquivo rastreado e rotaciona-los se tiverem sido usados.

Riscos inerentes, agora mitigados mas nao eliminaveis atomicamente:

- MySQL e Google Drive nao compartilham transacao distribuida;
- indisponibilidade prolongada do Drive mantem operacoes no journal;
- resultado de commit desconhecido exige reconciliacao posterior;
- limites e comportamento reais do ambiente de producao continuam dependendo da configuracao autorizada.

## 12. Melhorias que podem ficar para depois

- ampliar auditoria de categorias, disciplinas e concursos;
- criar painel operacional para visualizar/reprocessar o journal;
- limpeza automatica, com retencao definida, de operacoes concluidas;
- melhorar limpeza de canais webhook orfaos;
- tornar a recuperacao por e-mail inteiramente transacional/outbox;
- ampliar metricas de retries e tempo de reconciliacao.

## 13. Git diff resumido

O diff rastreado da implementacao possui aproximadamente **700 insercoes e 250 remocoes** em codigo e testes, alem da atualizacao do manifesto/lockfile e dos arquivos novos de migration, testes e deste relatorio. O numero exato inclui uma alteracao preexistente em `.env.example` e nao inclui automaticamente arquivos ainda nao rastreados.

Nenhuma migration anterior foi alterada. Nenhum arquivo frontend foi modificado nesta implementacao.

## 14. Git status

Branch: `fase/09-qa-producao`  
HEAD: `a9de5637fb06f7d83ac8e9acb1e3c6e27f50b119`

As correcoes permanecem sem commit, conforme solicitado. Ha arquivos modificados e novos.

Mudancas preexistentes preservadas, nao criadas por esta implementacao:

- `.env.example` modificado;
- `docs/relatorios/README_AUDITORIA_TRANSACOES_MYSQL.md` nao rastreado;
- `docs/relatorios/RELATORIO_AUDITORIA_OPERACOES_MUTAVEIS_2026-09-10.md` nao rastreado.

Nao houve commit, push, merge ou deploy.

## 15. Conclusao

As correcoes bloqueantes de transacoes, concorrencia e consistencia Drive/MySQL descritas na auditoria foram implementadas e passaram na suite completa. As vulnerabilidades de `multer` e `nodemailer` tambem foram corrigidas, com audits zerados e nova execucao integral dos testes.

Entretanto, ainda existem valores semelhantes a secrets em um arquivo rastreado ja modificado. Esse ponto precisa de decisao, eventual remocao e rotacao antes da auditoria final de producao.

**AINDA EXISTEM BLOQUEIOS**
