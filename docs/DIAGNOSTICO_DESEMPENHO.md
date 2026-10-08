# Carregamento e navegação — 08/10/2026

## Evidência em produção (antes das alterações locais)

- Na sessão Chrome do admin, cinco GETs da Biblioteca demoraram 30,1–30,4 s.
  A fase anterior ao `requestStart` consumiu ~30,075 s; após o envio,
  as respostas vieram em 49–325 ms, com HTTP 200. Na repetição, o acervo respondeu
  em ~332 ms e Usuários em 26 ms. Isso não confirma uma consulta SQL de 30 s.
- Login em sessão separada: HTML ~587 ms; consulta de sessão ~1.010 ms,
  iniciada em ~1.051 ms. O formulário só aparecia após essa consulta.
- A amostra de 1.500 entradas dos logs de 24 h continha 168 erros
  `ER_CANT_AGGREGATE_2COLLATIONS` no recebimento de notificações Drive.
  Não há evidência de que esses erros causem a demora anterior ao envio.

## Alterações locais

- Login mostra a interface durante a verificação de sessão, com campos e envio
  desabilitados até a conclusão. Retornos de confirmação/recuperação continuam
  aguardando a sessão. Nenhuma rota autenticada foi liberada.
- Painel, coleta de idade e áreas maiores usam importação por demanda.
  JS inicial passou de ~406,7 kB para ~265,0 kB (aproximadamente -35%; gzip
  ~119,3 para ~82,0 kB). Isso é tamanho do build, não promessa de redução
  proporcional no tempo real.
- O painel não busca mais a estrutura que não era utilizada na renderização.
  Organização busca categorias/disciplinas/concursos; Acessos busca seus cinco
  conjuntos; Drive busca seus dois estados; Pastas liberadas busca as permissões
  próprias. Demais áreas têm seus carregadores existentes, sem consultas extras.
- Menu permanece disponível; respostas de uma área anterior não sobrescrevem
  a carga atual. Acompanhamento visual da sincronização é limitado à aba Drive;
  a sincronização do servidor continua independente dela.
- Cache HTTP longo apenas para assets com hash; HTML, worker e manifest revalidam.
  APIs não recebem cache público de dados. O worker continua sem interceptar APIs.
- Webhook: comparação `?='sync'` trocada por indicador numérico calculado no
  backend. Preservadas validações de token, canal, recurso, expiração e replay.
  Sem migration, mudança de tabela ou alteração de arquivos do Drive.

## Limites e pendências

O atraso intermitente anterior ao envio ainda não tem causa isolada. Não alterar
proxy, timeouts, Service Worker ou segurança por hipótese. Próxima captura deve
registrar fila/conexão HTTP/2 e atividade de extensões/worker no instante do atraso,
comparando sessão normal com sessão limpa. Não enviar cookies/tokens no relatório.
CPU/RAM da hospedagem não foram confirmadas; não há indicação suficiente para
atribuir o problema a capacidade ou recomendar upgrade.

Validação local usa somente MySQL de testes, SMTP fake e provider fake. Não
considerar QA local como publicação ou comprovação de melhora em produção.

## Validação concluída

- `npm run check`: 298/298 testes backend, 5/5 PWA e build Vite.
- `node --test frontend/test/*.test.js`: 37/37 testes de interface.
- Teste integrado do webhook com collation da sessão diferente, replay,
  preparação do canal, token/recurso inválidos e expiração. A comparação antiga
  isolada não falhou neste MySQL local; o erro observado é de produção. A solução
  elimina a comparação entre parâmetro textual e literal, mas deve ser confirmada
  nos logs de produção após autorização para publicar.
- QA visual/API local: aluno com faixa ausente continua bloqueado pelo popup;
  com faixa declarada entra na Biblioteca; login/logout de contas fictícias;
  admin acessa Visão geral, Organização, Acessos e Drive; professor acessa
  Biblioteca e Pastas liberadas, sem aparecer menu administrativo.
- Em 390 px: login com card de 347 px, professor com menu móvel funcional,
  sem overflow horizontal. Não foi um teste de instalação em aparelho físico.
- Mudanças permanecem locais, sem commit/push/deploy nem migration nova.
