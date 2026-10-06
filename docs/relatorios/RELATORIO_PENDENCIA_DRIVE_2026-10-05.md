# Contenção da pendência de upload do Drive

## Produção — alteração pontual autorizada

Em 05/10/2026, 22:36:45 de Brasília (06/10/2026, 01:36:45 UTC), foi suspensa somente a retomada da operação 237. Tipo: upload; fase mantida: `reconciliacao_pendente`; resultado externo ainda desconhecido. Não foi marcada como concluída.

A atualização usou a named lock compartilhada com as operações do Drive, transação e condições por ID, chave, tipo, fase, erro e ausência de material/Drive ID. O UPDATE afetou uma linha. A trava foi liberada. Nenhuma tabela de materiais, categorias, usuários ou histórico foi atualizada.

Foram preservados os detalhes anteriores e acrescentados `revisaoNecessaria`, motivo, data UTC e a próxima tentativa anterior. Para que a versão atualmente publicada também respeite a suspensão, `proxima_tentativa_em` ficou em `9999-12-31 23:59:59.000`. Trata-se de um bloqueio de agendamento até revisão humana, não de previsão de conclusão. O código local novo também exclui registros com `revisaoNecessaria=true` da fila automática.

Uma consulta posterior confirmou a persistência: 4.787 tentativas, revisão necessária, conclusão nula e agendamento suspenso. Contagens antes/depois: 7.028 materiais e 2.733 categorias. Zero operações pendentes elegíveis para retomada automática no momento da contenção.

## Identificação ainda não concluída

A busca no Drive com a credencial local retornou `GOOGLE_AUTORIZACAO_INVALIDA`. Essa consulta não alterou credenciais nem arquivos; não comprova falha da conexão de produção e não comprova ausência do arquivo. Não foram copiadas credenciais de produção para o ambiente local.

Um arquivo com o mesmo nome não comprova a identidade do upload. A revisão deve consultar `appProperties.plantelOperationId` usando a conexão válida de produção e exigir correspondência única. Não associar pelo nome e não apagar candidatos.

## Recuperação segura

- Se o ID exato já estiver registrado, preservar o arquivo, registrar o vínculo do material na operação e concluir de forma idempotente.
- Se um arquivo único for identificado, mas ainda não estiver registrado, usar a reconciliação existente para indexá-lo antes de concluir; nunca excluí-lo como órfão por falta momentânea de registro.
- Se houver ausência de identificação ou múltiplos candidatos, manter revisão humana e a evidência. Um novo upload não encerra automaticamente a operação antiga.
- Não remover a suspensão nem zerar tentativas sem evidência de identidade/resultado e sem confirmar o código publicado. A eventual retomada deve atualizar o marcador e o agendamento sob a trava compartilhada.

## Alterações locais

Busca por operação recusa resultados ambíguos, inclusive paginação. Recuperação de upload incerto preserva arquivos não indexados e solicita uma reconciliação depois de liberar a trava. Vínculo de operação concluída usa ID exato. Retentativas GET limitadas, espera progressiva, suspensão por excesso de falhas e diagnóstico seguro fazem parte do conjunto local anterior.

`npm run check` passou após os ajustes (backend, PWA e build). Testes direcionados: 48/48. Não houve commit, push ou deploy do código nesta etapa.

## Correção posterior de concorrência na sincronização

A tentativa manual seguinte falhou em `trava_gravacao` com `SINCRONIZACAO_CONCORRENTE`: a aquisição imediata da trava compartilhada não aguarda operações concorrentes. A sincronização agora tenta novamente por até 30 intervalos de um segundo, devolvendo conexões ao pool entre tentativas. Não remove nem contorna a trava. A revalidação de credenciais, a proteção de alterações posteriores ao início da listagem e as transações existentes são preservadas.

O campo de diagnóstico existente sinaliza `SINCRONIZACAO_AGUARDANDO_TRAVA` enquanto aguarda, sem migration. A interface mostra a espera e mantém o botão desabilitado; a proteção de agendamento no banco continua rejeitando pedidos duplicados. Ao esgotar o prazo, falha antes de aplicar a árvore. Testes cobrem liberação durante a espera, espera inicial, prazo esgotado e disputa real de named lock no MySQL local com status e rejeição de pedido repetido.
