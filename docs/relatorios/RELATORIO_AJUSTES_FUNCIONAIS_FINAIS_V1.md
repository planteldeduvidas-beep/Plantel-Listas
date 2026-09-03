# RELATORIO DOS AJUSTES FUNCIONAIS FINAIS DA V1

Data: 03/09/2026
Estado: **APROVADO E CONCLUIDO**

## 1. Resumo

Os ajustes finais adicionaram nome no cadastro, suporte por e-mail para aluno e professor, historico pessoal de materiais para aluno, retencao controlada dos eventos brutos de analytics e um acesso discreto ao site institucional do Plantel.

A validacao humana visual foi concluida e aprovada. O campo `Nome` no cadastro tambem foi aprovado e permanece como parte definitiva dos ajustes funcionais finais da V1.

O trabalho permanece na branch `ajuste/funcionalidades-finais`, derivada de `b9411a7`, que ja continha o commit separado da correcao de seguranca do `qs`. Nao houve merge em `main`, deploy, configuracao de producao ou inicio da Fase 9.

Arquivos principais criados:

- migration `013_ajustes_funcionais_finais.sql`;
- modulos backend `suporte` e `historicoAluno`;
- rotina `executarRetencaoAnalytics.js`;
- telas `Suporte.jsx` e `MeuHistorico.jsx`;
- este relatorio.

Foram ajustados os modulos existentes de autenticacao, usuarios, analytics, acervo, configuracao, e-mail, rotas, navegacao, administracao e estilos, alem dos testes integrados e da documentacao de estado.

## 2. Nome do usuario

- o cadastro publico agora exige nome, e-mail e senha;
- o nome e normalizado, limitado a 120 caracteres e validado no backend;
- contas criadas pelo administrador tambem exigem nome;
- busca administrativa localiza por nome ou e-mail;
- a interface usa o nome no perfil e preserva o e-mail como identificacao secundaria;
- a migration deriva um nome inicial do e-mail para as contas anteriores, sem alterar senha, papel ou estado.

## 3. Suporte

Aluno e professor possuem a area `Suporte`, com assunto e mensagem. O backend determina nome, e-mail e papel pela sessao autenticada, aplica CSRF, limite de tentativas, validacao de tamanho e bloqueio de quebra de cabecalho. Administrador nao usa essa rota.

O destinatario e definido somente por `SUPPORT_EMAIL_TO`; nao e recebido do navegador. O envio reutiliza o provider SMTP existente, usa `replyTo` com o e-mail da conta e nao cria tickets, anexos ou historico paralelo. Falhas do provider retornam uma mensagem controlada sem revelar configuracao ou credenciais.

Variaveis adicionadas ao exemplo de ambiente:

- `SUPPORT_EMAIL_TO`;
- `SUPPORT_RATE_LIMIT_MAX`;
- `ANALYTICS_RAW_RETENTION_DAYS`;
- `ANALYTICS_RETENTION_BATCH_SIZE`;
- `BOOTSTRAP_ADMIN_NAME`.

O ambiente local possui SMTP completo, mas ainda nao possui `SUPPORT_EMAIL_TO`. Nenhum e-mail real de suporte foi enviado durante esta implementacao; os testes usam provider isolado.

## 4. Meu Historico

Somente o aluno possui a area `Meu Historico`. Cada item apresenta nome e tipo do material, ultima acao de visualizacao ou download, data/hora e a acao `Abrir novamente`.

A projecao pessoal e atualizada depois de uma entrega bem-sucedida e e separada dos eventos de analytics. A consulta usa exclusivamente o usuario da sessao, aceita somente pagina e limite, e retorna apenas PDF ou video funcional que continue disponivel em pasta ativa. Professor e administrador recebem 403, e IDs do Google Drive nao sao expostos.

## 5. Retencao e analytics

A politica padrao manteve eventos brutos por 180 dias, configuravel entre 90 e 3.650 dias. Antes de excluir qualquer dia antigo, a rotina grava agregados diarios de totais, alunos ativos, materiais, buscas e pastas em uma transacao. A exclusao ocorre em lotes configuraveis, com trava MySQL para impedir execucoes concorrentes.

A execucao e explicita pelo comando `npm run analytics:retention`, apropriado para agendamento operacional futuro. O dashboard combina agregados e eventos ainda brutos, preservando as metricas. O historico pessoal usa tabela propria e nao e afetado pela retencao.

Nenhuma retencao foi executada sobre os dados locais atuais. A base tinha 81 eventos brutos, entre 28/08/2026 e 03/09/2026, ocupando aproximadamente 16 KB de dados e 96 KB de indices. A agregacao diaria principal levou cerca de 1,15 ms para 7 dias, 0,39 ms para 30 dias e 0,35 ms para 90 dias no MySQL local. A medicao no banco de producao continua pendente ate um deploy autorizado.

## 6. Interface

- `Meu Historico` aparece apenas para aluno;
- `Suporte` aparece apenas para aluno e professor;
- o link `Site do Plantel` abre `https://planteldeduvidas.com.br` em nova aba;
- o link institucional passou a integrar o grupo principal da sidebar, em vez de ficar isolado no rodape;
- o bloco da conta separa nome, perfil e e-mail, com espaco reservado para a acao de sair;
- depois de um login concluido, somente o aluno recebe uma apresentacao breve da biblioteca, com fechamento imediato e acesso opcional ao site do Plantel; atualizar a pagina nao repete o pop-up;
- as novas areas seguem sidebar, tipografia, botoes, superficies e temas existentes;
- o cadastro exibe o campo `Nome` antes do e-mail;
- nao houve redesenho das areas aprovadas.

A tela publica de cadastro foi conferida em 320, 390, 768, 1.024, 1.366 e 1.920 px, em temas claro e escuro, sem rolagem horizontal. Uma conta local temporaria de aluno tambem validou login, pop-up, fechamento, ausencia de repeticao ao atualizar, sidebar, espaco da acao de sair, `Meu Historico`, `Suporte` e os dois temas nesses tamanhos. Em 320 x 567, o primeiro teste mostrou as acoes do pop-up abaixo da area inicialmente visivel; a saudacao passou a usar o primeiro nome e o conteudo foi compactado. O reteste manteve as duas acoes visiveis e sem overflow horizontal. A conta e sua sessao foram removidas ao final, e o navegador voltou para o login sem erros de console.

## 7. Banco e endpoints

A migration `013_ajustes_funcionais_finais.sql` adicionou:

- `usuarios.nome`;
- `historico_materiais_usuario`;
- `analytics_resumo_diario`;
- `analytics_materiais_diario`;
- `analytics_buscas_diario`;
- `analytics_pastas_diario`.

Novos endpoints:

- `GET /api/meu-historico` - somente aluno;
- `POST /api/suporte` - somente aluno ou professor, com CSRF e rate limit.

## 8. Testes e seguranca

Os testes integrados cobrem nome obrigatorio, identidade publica, suporte por papel, autenticacao, CSRF, rate limit, validacao e falha do provider; historico pessoal, isolamento entre alunos, permissao, material indisponivel e ausencia de Drive ID; e consolidacao de analytics com preservacao das metricas e do historico.

Resultado atual:

- `npm run check`: aprovado, 104 testes e build Vite;
- build frontend: aprovado, 32 modulos transformados;
- `npm audit`: 0 vulnerabilidades;
- `npm audit --omit=dev`: 0 vulnerabilidades;
- `git diff --check`: aprovado;
- migration 013: aplicada no MySQL local e no banco isolado de testes.

Nenhum `.env` real, arquivo de credencial, token OAuth ou padrao de secret foi encontrado nos arquivos rastreados. `backend/.env` e `frontend/.env` continuam ignorados.

## 9. Pendencias

- informar `SUPPORT_EMAIL_TO` no ambiente definitivo e validar o recebimento real quando autorizado;
- agendar `npm run analytics:retention` no ambiente definitivo;
- medir as agregacoes no banco de producao somente durante a etapa de deploy autorizada;
- manter as pendencias existentes de URL publica, OAuth, webhook e Hostinger.

## 10. Estado final

**APROVADO E CONCLUIDO**

Os ajustes finais foram aprovados na validacao humana e permanecem somente na branch `ajuste/funcionalidades-finais`, aguardando autorizacao separada para integracao. Nao houve merge, deploy, alteracao de configuracao de producao ou inicio da Fase 9.
