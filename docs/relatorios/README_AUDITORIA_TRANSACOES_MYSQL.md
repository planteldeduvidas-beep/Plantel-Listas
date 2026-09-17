# Auditoria de transações MySQL e consistência com Google Drive

Data da revisão: 17/09/2026  
Branch: `fase/09-qa-producao`  
Commit analisado: `a9de5637fb06f7d83ac8e9acb1e3c6e27f50b119`  
Estado: **CORREÇÕES NECESSÁRIAS ANTES DO DEPLOY**

Este README apresenta o resultado da auditoria das operações mutáveis do Plantel Listas, com foco em:

- transações e rollback no MySQL;
- consistência entre MySQL e Google Drive;
- auditoria administrativa;
- permissões, usuários e papéis;
- lixeira, restauração e exclusão permanente;
- sincronização completa e Changes API;
- locks, concorrência e conexões do pool.

A análise foi feita diretamente no código da branch indicada. Não foram executadas operações destrutivas, migrations, uploads ou alterações no Google Drive real.

O relatório técnico detalhado, com evidências, funções, contagem de queries e cenários intermediários de falha, está em:

- [Relatório completo — operações mutáveis](./RELATORIO_AUDITORIA_OPERACOES_MUTAVEIS_2026-09-10.md)

## Parecer executivo

O projeto possui transações MySQL em pontos importantes, incluindo materiais, classificação manual, permissões em lote, redefinição de senha, analytics, sincronização completa e Changes API.

Entretanto, a transação MySQL não cobre todo o ciclo das operações que também alteram o Google Drive. Foram encontrados riscos concretos de estado parcial, além de operações administrativas compostas por vários autocommits independentes.

Sob o aspecto de atomicidade e consistência, o estado atual **não deve ser considerado pronto para deploy** antes da correção dos bloqueios descritos abaixo.

## Resultado por operação

| Operação | Transação MySQL | Efeito externo/compensação | Classificação |
| --- | --- | --- | --- |
| Upload/criação de material | Material e auditoria na mesma transação | Cria no Drive antes; tenta excluir em falha | **CORREÇÃO NECESSÁRIA ANTES DO DEPLOY** |
| Edição/renomeação de material | UPDATE versionado e auditoria | Renomeia no Drive; tenta restaurar nome | **CORREÇÃO NECESSÁRIA ANTES DO DEPLOY** |
| Movimentação de material | UPDATE versionado e auditoria | Move no Drive; tenta mover de volta | **CORREÇÃO NECESSÁRIA ANTES DO DEPLOY** |
| Substituição de arquivo | Troca da referência e auditoria | Cria novo, envia antigo à lixeira e compensa em falha | **CORREÇÃO NECESSÁRIA ANTES DO DEPLOY** |
| Envio para lixeira | Estado e auditoria na mesma transação | Altera Drive primeiro; compensação é melhor esforço | **CORREÇÃO NECESSÁRIA ANTES DO DEPLOY** |
| Restauração | Estado e auditoria na mesma transação | Restaura Drive primeiro; compensação é melhor esforço | **CORREÇÃO NECESSÁRIA ANTES DO DEPLOY** |
| Exclusão permanente | Duas transações separadas pelo DELETE remoto | Exclusão externa é irreversível | **CORREÇÃO NECESSÁRIA ANTES DO DEPLOY** |
| Criação de categoria raiz | INSERT isolado | Não altera Drive | **ADEQUADA COM RESSALVA** |
| Criação de categoria filha | Sem transação entre validação e INSERT | Não altera Drive | **CORREÇÃO RECOMENDADA** |
| Edição/movimentação de categoria | Sem transação entre validação de ciclo e UPDATE | Não altera Drive | **CORREÇÃO NECESSÁRIA ANTES DO DEPLOY** |
| Ativação/desativação de categoria | Sem transação entre validação e UPDATE | Não altera Drive | **CORREÇÃO NECESSÁRIA ANTES DO DEPLOY** |
| Classificação manual de pastas | Sim, incluindo auditoria | Sem efeito externo | **ADEQUADA COM RESSALVA** |
| Classificação automática | Transação do chamador | Pode disputar com edição manual | **CORREÇÃO RECOMENDADA** |
| Cadastro público | INSERT isolado | Sem efeito externo | **ADEQUADA COM RESSALVA** |
| Criação/edição administrativa de usuário | Operação e auditoria separadas | Sem efeito externo | **CORREÇÃO RECOMENDADA** |
| Bloqueio/reativação de usuário | Estado, sessões e auditoria separados | Sem efeito externo | **CORREÇÃO NECESSÁRIA ANTES DO DEPLOY** |
| Alteração de papel | Papel, sessões, permissões e auditoria separados | Sem efeito externo | **CORREÇÃO NECESSÁRIA ANTES DO DEPLOY** |
| Concessão individual de permissão | Validações, concessão e auditoria separadas | Sem efeito externo | **CORREÇÃO NECESSÁRIA ANTES DO DEPLOY** |
| Revogação individual de permissão | Revogação e auditoria separadas | Sem efeito externo | **CORREÇÃO RECOMENDADA** |
| Permissões em lote | Revogações e concessões em transação | Validações e auditoria ficam fora | **CORREÇÃO NECESSÁRIA ANTES DO DEPLOY** |
| Logout | UPDATE idempotente | Sem efeito externo | **ADEQUADA** |
| Redefinição de senha | Senha, tokens e sessões em uma transação | Sem efeito externo | **ADEQUADA COM RESSALVA** |
| Solicitação de recuperação | Invalidação e criação do token separadas | Envio SMTP com compensação limitada | **CORREÇÃO RECOMENDADA** |
| Sincronização completa Drive → MySQL | Árvore, materiais e classificação em transação | Drive é somente lido | **ADEQUADA COM RESSALVA** |
| Lote da Changes API | Dados, cursor, status e classificação em transação | Drive é somente lido | **ADEQUADA COM RESSALVA** |
| Reagendamento de reconciliação | Estado persistido sem garantia de novo processamento | Depende de nova sincronização | **CORREÇÃO NECESSÁRIA ANTES DO DEPLOY** |
| Registro de uso e histórico do aluno | Evento e histórico em transação | Entrega HTTP não é transacional | **ADEQUADA COM RESSALVA** |
| Retenção de analytics | Agregação e exclusão por dia em transação | Sem efeito externo | **ADEQUADA** |
| Ativação local de canal webhook | Dois UPDATEs em transação | Canal remoto pode ficar órfão | **ADEQUADA COM RESSALVA** |

## Transações existentes

Foram encontrados 16 pontos com `beginTransaction()`:

- seis operações no repositório de gestão de materiais;
- classificação manual de pastas;
- permissões de professor em lote;
- redefinição de senha;
- registro de uso/histórico do aluno;
- retenção de analytics;
- sincronização completa do Google Drive;
- aplicação incremental da Changes API;
- ativação do canal webhook;
- classificação automática via script;
- execução de migrations.

O runner de migrations usa transação, mas instruções DDL do MySQL podem causar commit implícito. Portanto, rollback do runner não garante reversão integral de uma migration parcialmente executada.

## Bloqueios técnicos antes do deploy

### Compensação depois de commit confirmado

Criação e atualização de materiais fazem:

```text
alteração SQL
auditoria
COMMIT
SELECT de retorno usando o pool
```

Se o SELECT posterior falhar, o serviço recebe erro e executa a compensação no Drive, embora a alteração MySQL já esteja confirmada. Isso pode deixar o banco apontando para um estado ou arquivo que foi desfeito/excluído no Drive.

### Exclusão permanente sem retomada idempotente

Depois de confirmar `exclusao_pendente`, o arquivo é excluído do Drive e só então o banco conclui a exclusão. Se a conclusão falhar, a nova tentativa exige que o arquivo ainda exista antes de chegar ao DELETE idempotente.

### Papéis, sessões, permissões e auditoria fragmentados

A named lock administrativa serializa alguns participantes, mas não cria transação. Uma alteração de papel pode confirmar e falhar antes de revogar sessões ou permissões. A auditoria também ocorre depois, por autocommit separado.

### Corrida entre papel e concessão

O módulo de permissões valida o papel do professor antes de gravar, sem compartilhar a trava/transação da alteração de papel. Uma concessão já validada pode ser inserida depois de o usuário deixar de ser professor.

### Login concorrente com redefinição de senha

O login pode validar a senha antiga, aguardar, e criar uma sessão depois de a redefinição já ter atualizado a senha e revogado todas as sessões existentes.

### Reconciliação do Drive sem garantia de execução

A expiração do page token marca `reconciliacao_necessaria`, mas esse caminho não agenda automaticamente a sincronização completa. Um ciclo vazio posterior também não consome obrigatoriamente essa flag.

### Aquisição de trava da Changes API

Se o `GET_LOCK` lançar exceção em `googleDriveChangesRepository.adquirirTrava`, a conexão obtida do pool não possui cleanup garantido.

### Hierarquia sem unidade transacional

Validação de pai, verificação de subárvore e atualização da categoria são operações separadas. Movimentações concorrentes podem validar estados antigos e produzir ciclo ou relação ativa inválida.

## Compensações atuais do Google Drive

O sistema tenta compensar:

- upload novo, excluindo o arquivo criado;
- renomeação, restaurando o nome anterior;
- movimentação, retornando à pasta anterior;
- substituição, restaurando o arquivo antigo e removendo o novo;
- lixeira/restauração, aplicando a operação inversa.

Essas compensações são úteis, mas não são duráveis:

- falhas são ignoradas em vários caminhos;
- não existe registro persistente de operação pendente;
- não existe worker para repetir uma compensação falha;
- uma queda do processo impede a execução do catch;
- timeout pode significar operação externa concluída com resposta perdida;
- a sincronização posterior não recompõe necessariamente os estados de negócio da lixeira.

## Conexões e pool

Foram localizados 19 pontos de `getConnection()` no código de produção e scripts.

Os fluxos transacionais principais liberam a conexão em `finally`. Não foi encontrado um caminho normal que, após um BEGIN bem-sucedido, saia sem commit ou rollback.

Há duas ressalvas:

1. `googleDriveChangesRepository.adquirirTrava` não libera a conexão caso o próprio `GET_LOCK` lance erro.
2. As operações de Drive reservam uma conexão para a named lock e usam outras conexões do mesmo pool para continuar. A configuração aceita `DB_CONNECTION_LIMIT=1`, condição capaz de fazer a operação esperar por uma conexão que ela própria mantém reservada.

## Correções indicadas antes da produção

- eliminar compensações acionadas após commit confirmado;
- distinguir falha pré-commit, pós-commit e commit de resultado desconhecido;
- persistir as fases das operações Drive e permitir retry/reconciliação;
- tornar exclusão permanente retomável e idempotente;
- transacionar papel, sessões, permissões e auditoria como uma unidade;
- coordenar concessões com alteração de papel;
- impedir criação de sessão com credencial superada por redefinição;
- garantir que a flag de reconciliação seja consumida com retry;
- corrigir o cleanup da conexão na aquisição de trava;
- proteger validação e mudança da hierarquia na mesma unidade concorrente;
- exigir capacidade mínima adequada do pool ou reutilizar coerentemente a conexão.

## Melhorias que podem ser posteriores

- ampliar auditoria de categorias, disciplinas e concursos;
- vincular notificações do webhook aos lotes efetivamente processados;
- melhorar limpeza de canais webhook órfãos;
- definir se analytics representa início ou conclusão da entrega;
- melhorar o retorno idempotente de operações simples sem efeito externo;
- reforçar a operação exclusiva do bootstrap e do runner de migrations.

## Respostas finais

**Existem transações MySQL?** Sim, em 16 pontos explícitos.

**Existem operações que deveriam ser atômicas e não são?** Sim, principalmente papéis, sessões, permissões, auditoria administrativa, recuperação de senha e hierarquia.

**Existem riscos Drive ↔ MySQL?** Sim. As compensações atuais reduzem o risco, mas não cobrem queda do processo, timeout, falha da própria compensação ou compensação após commit.

**Há bloqueio técnico ao deploy?** Sim. Os problemas marcados como `CORREÇÃO NECESSÁRIA ANTES DO DEPLOY` devem ser resolvidos e testados em ambiente descartável antes da produção.

## Conclusão

O projeto possui uma base transacional relevante, mas ainda não oferece consistência ponta a ponta suficiente para todas as operações mutáveis críticas.

**Conclusão desta auditoria: NÃO PRONTO PARA DEPLOY sob o aspecto de transações, atomicidade e consistência Drive ↔ MySQL.**

Este README documenta o diagnóstico. Nenhuma correção foi implementada e nenhum deploy, merge, commit ou operação real no Google Drive foi executado como parte da auditoria.
