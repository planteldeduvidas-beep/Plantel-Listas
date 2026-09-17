# Auditoria técnica das operações mutáveis

Data: 10/09/2026. Estado: **AUDITORIA CONCLUÍDA — CORREÇÕES RECOMENDADAS, NÃO IMPLEMENTADAS**.

## 1. Escopo, evidência e limites

Revisão estática dos fluxos de escrita do backend: serviços, repositórios, rotas, provider do Google Drive, autenticação, auditorias, analytics e scripts operacionais. Foram incluídas escritas indiretas de consultas/downloads, OAuth, webhook, sincronização e classificação automática, além das operações solicitadas.

- Branch inspecionada: `fase/09-qa-producao`.
- HEAD: `a9de5637fb06f7d83ac8e9acb1e3c6e27f50b119`.
- Alteração preexistente: `.env.example` modificado; preservado.
- Nenhum código da aplicação, configuração, migration ou dado foi alterado. Foi criado somente este relatório.
- Não foram executados testes, migrations, uploads, envios de e-mail, operações de banco/Drive, commit, push, merge ou deploy.
- Cenários de falha e concorrência abaixo são deduzidos do código, não incidentes reproduzidos nem constatação de corrupção na base atual. Não foram verificados o isolamento/engine efetivos do banco em execução nem configurações de produção.
- Scripts destrutivos de preparação/teste são ferramentas de QA, não operações de negócio; não foram executados nem certificados como seguros para produção nesta auditoria.

Referências `arquivo:linha` são relativas à raiz do repositório e ao código inspecionado. Aprovações históricas da Fase 9A não substituem esta análise de caminhos de falha.

## 2. Parecer executivo

**Não é possível confirmar consistência integral de todas as operações mutáveis.** Há transações bem delimitadas em materiais, classificação manual, redefinição de senha, histórico/uso e aplicação de Changes, mas existem falhas de coordenação antes e depois dessas transações.

Prioridades mais importantes:

1. Falha de leitura depois do commit pode disparar exclusão/compensação de arquivo já confirmado no MySQL.
2. Alterações de papel, bloqueio, sessões, permissões e auditoria administrativa não formam uma unidade atômica.
3. Exclusão definitiva pode ficar pendente sem conseguir completar pela própria rota de repetição.
4. Compensações no Drive não são duráveis e suas falhas são descartadas.
5. Hierarquia, classificação automática/manual, login/redefinição e concessão/revogação têm janelas de concorrência.
6. Reconciliação pendente do Drive não é consumida de forma confiável pelo monitor.

Recomenda-se corrigir e validar os achados de prioridade alta antes de considerar esse conjunto de operações pronto para produção. Este parecer não modifica o relatório histórico da Fase 9A nem autoriza implementação.

## 3. Como interpretar transação e rollback

Uma instrução DML isolada em InnoDB/autocommit é atômica: ausência de `beginTransaction()` não é, sozinha, defeito. O problema aparece quando várias gravações ou validações precisam representar uma única operação de negócio.

`GET_LOCK` serializa participantes que usam a mesma trava; não inicia transação, não reverte gravações e não bloqueia alterações feitas diretamente no Google Drive. Um `rollback()` só desfaz alterações SQL ainda não confirmadas, não desfaz commit nem chamadas HTTP. Compensação é outra operação externa, que também pode falhar.

“Sim, SQL” nas tabelas significa transação no trecho de banco, não transação distribuída com Drive/SMTP. “Não necessário” significa ausência de defeito de atomicidade naquele trecho isolado, não certificação de todo o sistema.

## 4. Matriz das operações solicitadas

| Operação | 1. Transação MySQL? | 2. Rollback? | 3. Risco de estado parcial? | 4. Compensação Drive? | 5. Precisa correção? |
| --- | --- | --- | --- | --- | --- |
| Criar material por upload | Sim: material + auditoria | Sim, antes do commit | Sim: Drive antes do banco; leitura depois do commit; crash/timeout | Tenta excluir arquivo criado | **Sim, alta: A01/A02** |
| Receber upload temporário | Não grava MySQL nessa etapa | Não SQL; limpeza com `unlink` | Sim: falha de limpeza/crash pode deixar temporário; upload remoto pode concluir sem resposta | Na criação, somente depois de obter o ID | **Sim, A02; limpeza operacional complementar** |
| Editar nome/metadados | Sim: UPDATE versionado + auditoria | Sim, SQL | Sim: nome externo revertido após commit; metadados sem rename podem retornar erro após sucesso | Renomeia de volta quando houve rename | **Sim, A01/A02** |
| Substituir arquivo | Sim: troca de referência + auditoria | Sim, SQL | Sim: dois arquivos/estados externos; pode apagar o novo já referenciado | Restaura antigo e exclui novo, melhor esforço | **Sim, alta: A01/A02** |
| Mover material | Sim: categoria/pai + auditoria | Sim, SQL | Sim: Drive e banco podem terminar em pastas diferentes | Move de volta | **Sim, A01/A02/A05** |
| Enviar à lixeira | Sim: estado + auditoria | Sim, SQL | Sim: Drive alterado antes da transação; compensação falível | Retira da lixeira | **Sim, A02/A05** |
| Restaurar material | Sim: estado/categoria + auditoria | Sim, SQL | Sim: restauração externa pode sobreviver à falha SQL | Envia de volta à lixeira | **Sim, A02** |
| Excluir definitivamente | Duas transações: pendente e conclusão; reversão isolada | Apenas cada etapa SQL | Sim: arquivo removido e banco pendente/lixeira | Não é reversível; requer conclusão idempotente | **Sim, alta: A03** |
| Conceder/revogar acesso individual | Não: DML e auditoria separados | Não do fluxo completo | Sim: acesso efetivado sem auditoria; validação obsoleta | N/A: autorização interna, não compartilhamento Drive | **Sim, A04/A05** |
| Substituir permissões em lote | Sim, somente revogar/inserir concessões | Sim, lote; não auditoria posterior | Sim: lote confirma sem auditoria; papel/pasta mudam após validação | N/A | **Sim, A04/A05** |
| Cadastro público de aluno | Não explícita; INSERT único e leitura posterior | Não após INSERT | Conta pode existir mesmo se resposta falhar | N/A | Não exige transação só pelo INSERT; tratar retorno/repetição |
| Criação administrativa de usuário | Não: INSERT, leitura e auditoria separados | Não do fluxo completo | Sim: usuário criado e auditoria ausente | N/A | **Sim, A04** |
| Editar nome/e-mail do usuário | Não: UPDATE e auditoria separados | Não do fluxo completo | Sim: dados alterados apesar de resposta de erro | N/A | **Sim, A04** |
| Alterar papel | Não; trava administrativa não é transação | Não do fluxo completo | Sim: papel, sessões, concessões e auditoria parciais | N/A | **Sim, alta: A04/A05** |
| Bloquear/reativar usuário | Não; gravação sob trava e efeitos posteriores fora dela | Não do fluxo completo | Sim: bloqueio/reativação, sessões e auditoria desacoplados | N/A | **Sim, A04** |
| Auditoria de material | Sim, com a gravação de material | Sim | Atomicidade SQL correta; não representa necessariamente resultado externo final | Não registra duravelmente compensações falhas | **Sim, A01/A02/A03** |
| Auditoria geral administrativa | INSERT isolado, separado da operação | Não reverte operação de negócio | Sim: sucesso sem trilha; resposta de erro após sucesso | N/A | **Sim, A04** |
| Auditoria de classificação | Sim, nos chamadores atuais | Sim | SQL atômico; valores anteriores podem estar obsoletos na automática | N/A | **Sim, A08 na automática** |

Criação e upload de material são o mesmo fluxo público em `gestaoMateriaisRoutes.js:12`; não há duas transações independentes de criação a certificar. Importação pela sincronização está discriminada abaixo.

## 5. Demais fluxos mutáveis

| Operação | Transação MySQL? | Rollback? | Estado parcial? | Compensação externa? | Correção/parecer |
| --- | --- | --- | --- | --- | --- |
| Login/criar sessão | INSERT único, fora da leitura/verificação de senha | Não do fluxo leitura + INSERT | Sim: login em curso atravessa redefinição de senha | N/A | **A07** |
| Logout/revogar sessão individual | UPDATE único | Não necessário para a instrução isolada | Resposta/cookie podem falhar após revogação; repetição é segura no banco | N/A | Sem defeito de atomicidade isolada identificado |
| Solicitar recuperação de senha | Não: invalida antigas + insere nova | Não do conjunto | Sim: falha entre gravações e concorrência | SMTP: invalida token novo quando envio lança erro | **A06** |
| Redefinir senha | Sim: senha + tokens + sessões; token `FOR UPDATE` | Sim | Não entre as gravações da transação; há corrida com login externo a ela | N/A | Transação interna adequada; **A07** no protocolo de sessões |
| Recuperação iniciada pelo admin | Fluxo anterior + auditoria separada | Não global | Sim: e-mail/tokens e trilha não atômicos | Não recolhe e-mail enviado | **A04/A06** |
| Criar/editar/ativar categorias | DML isolado; validações antes | Não do fluxo completo | Sim: ciclos/hierarquia ativa; divergência de pastas Drive | Nenhuma | **A09** |
| Criar/editar/ativar disciplinas e concursos | DML isolado + leitura | Não global | Resposta pode falhar após sucesso; nenhuma trilha geral nessas rotas | N/A | DML isolado adequado; definir política de auditoria e concorrência |
| Classificar pastas manualmente, unitário/lote | Sim: validações, linhas de categorias travadas, alterações e auditoria | Sim | Não entre alteração e auditoria; disputa com automática | N/A | Trecho atômico adequado; **A08** |
| Classificação automática e seu CLI | Transação do chamador: sync/Changes/CLI | Sim | Sim por leitura obsoleta, não por ausência de transação | N/A | **A08** |
| Iniciar OAuth/consumir state/salvar credencial | DMLs separados; consumo é UPDATE condicional atômico | Não global | State consumido antes de troca/persistência; falha exige nova conexão | Não há reversão do consentimento/troca | Não reabrir state usado; documentar reinício e resultado incerto |
| Invalidar credencial/sinalizar reconexão | UPDATE único; credencial de ambiente pode ser salva antes | Não global | Falha SQL pode impedir sinalização; erro tardio pode marcar credencial renovada | Não | Endurecer coordenação/versionamento como melhoria |
| Solicitar/recuperar sincronizações | Travas + DML isolado; agendamento em memória | Não global | Job pode ficar aguardando até recuperação; recuperação marca falha, não refaz | Drive somente leitura | **A10**; recuperação não equivale a retry |
| Importação/sincronização completa | Sim: árvore, materiais e classificação | Sim nesse conjunto | Sim: status e flag de reconciliação fora do commit | N/A: importa estado externo, não o desfaz | **A10**, além de A08 |
| Changes API, lote incremental | Sim: dados + cursor + classificação + registro da sync | Sim; savepoint no caminho de subárvore | Lote atômico; itens adiados dependem de reconciliação | N/A: Drive somente leitura | Núcleo adequado; **A10** |
| Preparar/ativar/renovar canal webhook | Ativação SQL é transacional; preparação e API externas separadas | Sim, ativação SQL | Canal remoto criado sem ativação local; renovações concorrentes | Encerra canal anterior em melhor esforço; não novo em falha de ativação | **A11** |
| Receber/deduplicar/processar notificações | INSERT IGNORE e UPDATE isolados | Não global | Marca todas processadas, incluindo chegadas durante lote/backlog | N/A | **A10**; polling reduz impacto, não corrige semântica |
| Registrar visualização/download + histórico do aluno | Sim: evento e upsert do histórico | Sim | SQL atômico; registrado antes de terminar entrega HTTP ao usuário | Não existe rollback de stream | **A12** para semântica/entrega |
| Registrar acesso/busca | INSERT IGNORE por evento; dois eventos sem transação comum | Não do par | Acesso pode existir sem busca; erro bloqueia resposta da consulta | N/A | **A12**; decidir atomicidade do par e política de falha |
| Retenção de analytics | Sim, por dia: agrega e exclui; trava exclusiva | Sim, dia atual | Dias já confirmados permanecem; não há rollback global do job | N/A | Adequado para execução retomável sobre dias antigos sem novas inserções retroativas |
| Bootstrap do primeiro admin | Trava própria + INSERT; sem transação explícita | Não após INSERT | Sucesso pode preceder falha de retorno; trava não é a de administração | N/A | Executar exclusivamente no bootstrap, sem administração concorrente |
| Migrations/criação de banco | Runner chama transação, mas contém DDL | **Não garante rollback de DDL** | Schema parcial sem registro da migration; sem trava entre runners | N/A | **A13**, backup/restore e execução exclusiva |

Retenção: todos os lotes de DELETE do mesmo dia permanecem na mesma transação; o tamanho do lote não limita o volume total de locks/undo desse dia. Os agregados usam substituição dos valores, não soma: reinserções retroativas em dia já consolidado exigem política específica para não substituir totais históricos por um subconjunto. Não foi identificada rota pública de retrodatação de eventos.

## 6. Achados detalhados e recomendações

### A01 — Alta: compensação disparada depois de commit bem-sucedido

Evidências: `backend/src/modules/materiais/gestaoMateriaisRepository.js:100`, especialmente `:111-112` e `:140-141`; `gestaoMateriaisService.js`, funções `adicionar`, `editar`, `mover` e `substituir`.

`criarMaterial` e `atualizarMaterial` confirmam a transação e retornam `buscarMaterial()` pelo pool. Se essa leitura rejeitar, o serviço recebe uma falha indistinguível de falha transacional e executa a compensação no Drive. Exemplo: substituição confirma a referência ao arquivo novo; SELECT de retorno falha; serviço restaura o antigo e exclui o novo. O MySQL continua apontando para o arquivo excluído, com auditoria de sucesso.

O `return` da Promise sem `await` não permite tratar sua rejeição no catch local; mesmo com `await`, rollback posterior ao commit não desfaria a gravação. A correção não é apenas adicionar `await`.

Recomendação: obter a representação antes do commit na mesma conexão ou construir retorno independente de consulta pós-commit; distinguir resultado confirmado, falha anterior e commit de resultado incerto. Nunca compensar automaticamente uma gravação sabidamente confirmada. Separar também falha de serialização/resposta do resultado da operação.

### A02 — Alta: compensação externa não durável e resultado incerto

Evidências: `gestaoMateriaisService.js`, funções de escrita e seus `.catch(function ignorar...)`; `backend/src/shared/providers/googleDriveProvider.js:315` e `:341`.

Drive é alterado antes do SQL. Uma queda do processo nessa janela não executa catch/finally. Falhas de compensação são descartadas, sem registro próprio recuperável; o comentário do upload não substitui esse registro. Timeout também não comprova que uma escrita externa não aconteceu. Se o upload concluiu remotamente mas sua resposta/ID não chegou, a rotina não consegue sequer entrar na compensação por ID.

Na substituição há adicionalmente a sequência criar novo → colocar antigo na lixeira → atualizar banco. Falhar ou cair em cada fronteira produz um estado diferente. A trava MySQL protege apenas processos cooperantes: alteração humana direta no Drive pode ocorrer entre validação, escrita e compensação, e uma compensação cega pode sobrescrevê-la.

Recomendação: diário persistente de operação e fases, IDs/estado anterior, chave de idempotência/correlação, reconciliação por resultado observado e retry controlado. Registrar falha de compensação com identificador da operação, sem segredos. Prever limpeza de temporários interrompidos. Não manter uma transação SQL longa aberta durante toda chamada de rede como suposta solução distribuída.

### A03 — Alta: exclusão definitiva pendente não consegue concluir no retry

Evidências: `gestaoMateriaisService.js`, `excluirDefinitivamente` e `exigirArquivoDoAcervo`; `gestaoMateriaisRepository.js:173`, `:186`, `:197`; provider `googleDriveProvider.js:201` e `:417`.

Sequência: confirma `exclusao_pendente` → DELETE remoto bem-sucedido → falha em `concluirExclusao`. Na nova tentativa, a função exige primeiro GET do arquivo existente na lixeira. O GET do arquivo já removido falha antes do trecho que aceita `GOOGLE_ARQUIVO_NAO_ENCONTRADO` no DELETE. Esse GET ainda traduz 404 como indisponibilidade genérica.

Se DELETE teve timeout após executar, o código pode reverter o banco para `lixeira` embora o arquivo tenha desaparecido. `reverterExclusao` não acrescenta auditoria dessa reversão. Não foi encontrado worker específico que conclua esses estados.

Recomendação: retomada idempotente baseada no estado persistido e identidade previamente autorizada; distinguir ausência confirmada de falta de acesso; concluir pendência sem exigir que o arquivo removido ainda exista. Preservar as barreiras de raiz/permissão. Não tratar todo erro/404 externo indiscriminadamente como autorização para apagar/concluir.

### A04 — Alta: unidade administrativa fragmentada

Evidências: `backend/src/modules/usuarios/usuarioService.js:30`, `:37`, `:45`, `:78`; `usuarioRepository.js:139`; `backend/src/modules/permissoes/permissaoService.js:26`, `:71`, `:88`; `permissaoRepository.js:89`; `backend/src/modules/auditoria/auditoriaRepository.js:2`.

As gravações usam autocommit em chamadas separadas. A trava administrativa não fornece conexão transacional ao callback. Uma troca de papel pode persistir e falhar antes de revogar sessões ou permissões; falha no INSERT de auditoria deixa alteração efetivada sem trilha. O lote de permissões tem transação interna, mas a auditoria é inserida depois.

Na desativação, revogação de sessões acontece depois da liberação da trava. Importante: a autenticação consulta `usuarios.ativo` e `usuarios.papel` atuais; isto **não prova que um usuário bloqueado continue autorizado** nem que mantenha o papel antigo. O risco concreto é revogação incompleta, sessão antiga utilizável após reativação, promoção aplicada a sessão não revogada e permissões antigas reaparecendo em posterior retorno ao papel professor.

Recomendação: transação compartilhada para usuário + sessões + concessões + auditoria de sucesso, com validações e política de último admin sob coordenação comum. Permitir que os repositórios recebam o executor transacional. Registrar falhas operacionais separadamente, sem transformar auditoria de sucesso em simples log descartável.

### A05 — Alta: permissões e mutações não compartilham protocolo de concorrência

Evidências: `permissaoService.js:26`, `:88`; `usuarioService.js:91`; `gestaoMateriaisService.js`, `exigirCategoria` e `executarComTravaDeOperacao`.

A concessão valida o professor antes da gravação. Uma troca de papel pode revogar todos os acessos e, em seguida, a concessão já validada inserir outro acesso ativo para quem deixou de ser professor. A transação do lote não resolve a validação anterior. Analogamente, uma requisição de material já autorizada pode prosseguir enquanto se revoga seu acesso ou se altera a árvore de pastas.

Recomendação: validar papel/estado e concessões sob locks/versionamento coordenados com revogação e alteração de papel. Definir explicitamente o tratamento de operações em andamento: permitir conclusão iniciada antes da revogação ou cancelar/reconciliar. Não apresentar a trava do Drive como garantia de revogação instantânea.

### A06 — Média: emissão de recuperação não atômica; SMTP é melhor esforço

Evidências: `backend/src/modules/autenticacao/autenticacaoRepository.js:57`; `autenticacaoService.js:70`.

Invalida tokens antigos e depois insere o novo em outra gravação. Uma falha intermediária deixa o usuário sem o novo link. Solicitações concorrentes podem intercalar as invalidações/inserções e terminar com mais de um token não utilizado. E-mail ocorre depois; falha do envio invalida o token novo, mas não restaura o anterior. Timeout pode corresponder a e-mail entregue com link invalidado. O erro SMTP é absorvido para manter a resposta neutra; falha da invalidação pode escapar.

Recomendação: transação e serialização por usuário para emissão; manter resposta sem enumeração; definir entrega/retry observável com credenciais protegidas. E-mail já enviado não pode ser desfeito por rollback SQL.

### A07 — Alta: login pode criar sessão depois da revogação na troca de senha

Evidências: `autenticacaoService.js:36`; `autenticacaoRepository.js:2`, `:80`.

Login lê hash, verifica senha e só depois insere sessão. Enquanto isso, a redefinição pode atualizar senha, revogar sessões existentes e confirmar. O login previamente iniciado com a senha antiga então insere uma sessão nova, não alcançada pela revogação. A transação da redefinição está correta internamente; falta coordenação com o criador de sessões.

Recomendação: versão de credencial/sessão ou revalidação atômica do hash/estado observado na emissão da sessão, coordenada com redefinição e revogação. Testar com barreiras de concorrência; não presumir resolução somente por transacionar o INSERT.

### A08 — Média: classificação automática pode sobrescrever manual concorrente

Evidências: `backend/src/modules/materiais/classificacaoAutomatica.js:128`, `:154`; `backend/src/modules/materiais/acervoRepository.js:185`; `backend/scripts/classificarAcervo.js`.

A automática lê as categorias sem `FOR UPDATE`, decide ignorar origem manual usando esse snapshot e depois atualiza por `id` sem condição de origem/versão. Se a manual confirmar depois dessa leitura e antes do UPDATE automático, pode ser sobrescrita. A auditoria automática também usa valores anteriores desse snapshot. A transação assegura gravação conjunta, mas não a regra de preservar a escolha manual concorrente.

Recomendação: leitura bloqueante/revalidação por linha ou UPDATE condicional por versão/origem, preservando auditoria fiel ao estado efetivamente substituído. Aplicar em todos os chamadores, incluindo CLI.

### A09 — Alta para hierarquia; média para contrato Drive: categorias

Evidências: `backend/src/modules/categorias/estruturaAcervoService.js:60`, `:84`, `:90`, `:103`; `estruturaAcervoRepository.js:63`, `:75`, `:87`; rotas administrativas em `estruturaAcervoRoutes.js:5`.

Verificação de pai, descendentes e filhos ativos está separada do UPDATE/INSERT. Duas movimentações opostas podem validar a árvore antiga e criar ciclo; desativar pai concorrentemente à criação/ativação de filho pode quebrar a hierarquia ativa. FKs não representam a regra completa de árvore.

Essas rotas também alteram nome/pai/ativo somente no MySQL, inclusive sem coordenação com a sincronização. Para categorias ligadas ao Drive, podem divergir da pasta física e depois ser sobrescritas pela importação. Se a intenção for apenas organização virtual, isso precisa ser explícito e separado da hierarquia espelhada; não se deve adicionar mutações físicas automaticamente.

Recomendação: transação + serialização/revalidação da estrutura; definir autoridade da hierarquia e restringir ou coordenar alterações de pastas vinculadas. Auditar essas mutações caso a trilha administrativa deva ser completa.

### A10 — Alta para reconciliação; média para status/notificações: sincronização

Evidências: `googleDriveChangesService.js:70`, `:102`, `:209`; `googleDriveChangesRepository.js:296`, `:471`, `:485`; `integracaoGoogleDriveRepository.js:165`, `:323`; `integracaoGoogleDriveService.js`, `executarSincronizacao`, `solicitarSincronizacaoAutomatica` e `recuperarSincronizacoesInterrompidas`.

- Changes confirma dados, cursor e indicador de reconciliação na mesma transação: ponto positivo.
- O monitor solicita reconciliação a partir do resumo do lote atual, não da flag persistida previamente. Na expiração do token, salva um novo cursor e marca reconciliação, mas não agenda a sincronização nesse caminho. Um lote seguinte vazio não a agenda: lacuna persistente é possível.
- Quando agenda fallback, ainda mantém a trava do Drive. O worker agendado pode disputar essa trava, falhar por concorrência e não ser reagendado pela flag em ciclo vazio. Credencial apenas de ambiente também pode impedir `solicitarSincronizacaoAutomatica`, que exige registro com autorizador no banco.
- Sincronização completa confirma dados antes de atualizar status e limpar flag, em instruções separadas. Pode haver dados aplicados e job marcado falho/interrompido, ou flag não limpa apesar de conclusão.
- Todas as notificações pendentes são marcadas processadas após um ciclo limitado a 25 mudanças, sem corte temporal/cursor. Polling continua consumindo Changes e reduz perda prática, mas a marca não comprova processamento de cada notificação/backlog.

Recomendação: reconciliação como tarefa persistente retomável, baseada na flag armazenada, executada depois de liberar a trava, com retry para disputa. Agrupar status final e dados quando pertencem à mesma unidade SQL, ou registrar claramente fases distintas. Não avançar para novo cursor após expiração sem garantir a recuperação do intervalo perdido. Vincular processamento de notificações ao trabalho efetivamente coberto.

### A11 — Média: canal webhook órfão após falha de ativação

Evidências: `googleDriveChangesService.js:158`; `googleDriveChangesRepository.js:393`, `:405`.

A ativação SQL já possui transação e rollback — não há falta de transação nessa função. Porém, se `observarAlteracoes` criar o canal remoto e a ativação SQL falhar, o catch apenas encerra a preparação no banco; não encerra o canal remoto novo conhecido. Encerramento do anterior é assíncrono com erro ignorado. Renovações concorrentes não têm exclusão comum. A expiração e o polling mitigam disponibilidade, mas não tornam o fluxo atômico.

Recomendação: serializar renovação, compensar canal novo conhecido e registrar falhas/retry de encerramento. Tratar timeout de criação como resultado incerto, não ausência garantida de canal.

### A12 — Média: histórico/analytics não significa entrega concluída

Evidências: `backend/src/modules/analytics/analyticsRepository.js:2`, `:31`; `analyticsService.js:7`, `:16`; `backend/src/modules/materiais/acervoService.js`, `consultar` e `obterArquivo`.

Evento e histórico pessoal são confirmados juntos, corretamente. Contudo, `obterArquivo` registra o uso após obter a resposta do provider e antes de devolver o stream ao controller; o usuário ainda pode não receber o conteúdo completo. Se o registro falhar, a entrega pode ser negada apesar de o provider ter respondido. Na busca, grava acesso e busca separadamente e aguarda ambas antes de responder.

Recomendação: definir o evento como início de entrega ou implementar critério explícito de conclusão observável; ajustar documentação/métrica ao contrato real. Definir se falha de telemetria deve bloquear leitura e, se não, usar entrega persistente/retry em vez de ignorar silenciosamente. Nenhuma transação SQL garante atomicidade com a recepção dos bytes pelo navegador.

### A13 — Média operacional: rollback de migrations não cobre DDL

Evidência: `backend/scripts/executarMigrations.js`, laço de execução do SQL e INSERT em `migrations`.

O runner usa begin/commit/rollback por arquivo, mas instruções DDL podem confirmar implicitamente. Uma falha intermediária pode deixar schema parcialmente aplicado sem registro do arquivo como concluído. Não existe trava no runner impedindo duas execuções simultâneas. Essa limitação de DDL é documentada pelo [MySQL 8.0 — implicit commits](https://dev.mysql.com/doc/refman/8.0/en/implicit-commit.html).

Recomendação: execução exclusiva, precondições/pós-condições, detecção de aplicação parcial e roteiro de recuperação/backup/restore. Não confiar em rollback da aplicação para desfazer schema. Nenhuma migration foi executada nesta revisão.

### A14 — Média operacional: conexões reservadas e falha na aquisição de trava

Evidências: `gestaoMateriaisService.js`, `executarComTravaDeOperacao`; `gestaoMateriaisRepository.js:23`, `:100`; `googleDriveChangesRepository.js:244`; `backend/src/shared/database/conexao.js`.

Gestão reserva uma conexão para a trava e faz consultas/transações em outras conexões do mesmo pool. Em um pool limitado a uma única conexão, a detentora da trava ocupa o recurso necessário para o próprio fluxo continuar, e só o liberaria ao terminar. Em pools maiores, esse desenho também consome capacidade adicional. Fila finita não é timeout de espera; `connectTimeout` limita estabelecimento da conexão, não resolve esse ciclo.

Além disso, `googleDriveChangesRepository.adquirirTrava` não libera a conexão em catch se `execute(GET_LOCK...)` lançar erro, diferentemente dos outros dois repositórios de Drive. Dependendo da falha/estado do socket, pode haver retenção de recurso.

Recomendação: usar executor/conexão de forma coerente, validar capacidade mínima compatível ou separar pool de locks, limitar espera e garantir cleanup na aquisição falha. Não foi medido esgotamento no ambiente atual.

## 7. Cobertura de auditoria

O endpoint de histórico unifica fontes, mas não torna essas fontes atomicamente completas:

- Materiais: auditoria transacional de sucesso e etapas de exclusão; compensações ignoradas não têm trilha durável.
- Classificação: alterações e auditoria juntas; automática requer correção de concorrência A08.
- Usuários/permissões: auditoria geral posterior, sem executor transacional compartilhado.
- Sincronização: Changes inclui resumo no commit; sincronização completa conclui status separadamente.
- Categorias/catálogos, cadastro público, login/logout, OAuth e suporte não possuem, nos fluxos inspecionados, a mesma trilha geral administrativa. Isso é lacuna de cobertura se o requisito for auditar toda mutação, não prova de violação de um requisito funcional previamente aprovado.
- Suporte envia somente SMTP, sem criar ticket/histórico. Não há estado de negócio SQL para transacionar nem e-mail enviado que possa ser revertido. Retry do usuário após timeout pode duplicar mensagem; idempotência só deve ser adicionada se fizer parte do contrato desejado.

## 8. Validação recomendada após autorização

Os seguintes testes **não foram executados** nesta auditoria:

1. Injetar falha no SELECT pós-commit de criação/edição/movimentação/substituição; verificar que arquivo confirmado não é compensado.
2. Injetar falha antes/depois de cada escrita Drive/SQL e no próprio compensador; reiniciar processo e verificar recuperação persistente.
3. DELETE remoto bem-sucedido seguido de falha SQL; repetir exclusão pendente sem depender da existência do arquivo.
4. Falhar auditoria e revogação de sessões no meio de alteração administrativa; exigir tudo-ou-nada para a unidade definida.
5. Executar concessão versus demissão de professor e mutação versus revogação com barreiras controladas.
6. Pausar login depois de validar senha; concluir redefinição; retomar login e impedir sessão com credencial antiga.
7. Disputar classificação automática/manual e movimentos cíclicos de categorias.
8. Expirar page token, disputar trava do fallback e falhar status pós-sync; exigir retomada automática sem intervenção manual.
9. Criar canal remoto e falhar ativação SQL; verificar cleanup/retry e renovação concorrente.
10. Interromper stream, falhar telemetria e validar o significado de evento/histórico.
11. Simular pool restrito e falha em GET_LOCK; verificar liberação de conexões e espera limitada.
12. Em base descartável, falhar migration após DDL e validar recuperação. Não usar a base original/produção para injeção de falhas.

## 9. Fechamento

A auditoria encontrou proteções reais, mas **transação SQL existente não equivale a consistência ponta a ponta**. Há correções necessárias nos fluxos de maior risco e melhorias operacionais a planejar. Não foi constatado por consulta ao banco que algum cenário já tenha ocorrido.

Entrega restrita a este relatório. Código, `.env.example` preexistente, banco e serviços externos foram preservados. Nenhuma correção implementada; aguarda autorização explícita para eventual próximo trabalho.
