# ESTADO ATUAL DO PROJETO - PLANTEL LISTAS

Versao da documentacao: 1.1
Atualizado em: 03/09/2026

## Status

FASE 0 concluida: documentacao e preparacao inicial.

FASE 1 aprovada pelo responsavel humano e integrada na branch `main`.

FASE 2 aprovada pelo responsavel humano e integrada na branch `main`.

O fechamento tecnico e o merge seguro foram concluidos. Nenhum deploy foi realizado.

FASE 3 aprovada pelo responsavel humano e integrada na branch `main`.

Categorias, disciplinas, concursos, acessos de professor por pasta e a revisao de UX foram aprovados. Nenhum deploy foi realizado.

FASE 4 aprovada pelo responsavel humano e integrada na branch `main`.

A integracao OAuth server-side, a indexacao administrativa e a sincronizacao idempotente do Google Drive foram validadas localmente com o acervo real. A sincronizacao longa foi desacoplada da requisicao HTTP, possui status persistido, polling no frontend e recuperacao de interrupcoes. Nenhum deploy foi realizado.

O Google OAuth esta atualmente em modo `Testing`. Como o sistema utiliza o scope restrito `drive`, a autorizacao e o refresh token da conta de teste podem expirar apos aproximadamente sete dias e exigir reconexao. Isso e comportamento esperado do ambiente de teste, nao falha do Plantel Listas. Antes do uso definitivo sera necessario configurar o OAuth para producao e cumprir o processo de verificacao aplicavel a esse scope.

FASE 5 aprovada pelo responsavel humano, concluida e integrada na branch `main`.

FASE 6 aprovada pelo responsavel humano, concluida e integrada na branch `main`.

Upload, edicao, movimentacao, substituicao, lixeira, restauracao e exclusao administrativa foram implementados e aprovados em validacao humana. O OAuth foi ampliado conscientemente para `https://www.googleapis.com/auth/drive`, a conta de teste foi reconectada e as operacoes foram aprovadas no Drive real somente com pasta, usuarios e arquivos temporarios da Fase 6. As barreiras da pasta raiz e das permissoes foram validadas e toda a estrutura temporaria foi removida. Nenhum arquivo legado foi alterado ou excluido. Nenhum deploy foi realizado.

FASE 7 aprovada pelo responsavel humano, concluida e integrada na branch `main`.

A fase adicionou gestao administrativa de usuarios, protecao do ultimo administrador ativo, salvamento atomico dos acessos de professores, analytics de uso, relatorio CSV e historico geral imutavel pela interface. Os eventos de uso possuem deduplicacao controlada e nao armazenam tokens, secrets ou conteudo de arquivos. Os fluxos e a linguagem foram aprovados no navegador por um administrador leigo. Nenhum deploy foi realizado.

FASE 8 aprovada pelo responsavel humano, concluida e integrada na branch `main` no fechamento autorizado.

O frontend recebeu acabamento visual responsivo inspirado na referencia aprovada, adaptado para a identidade grafite, verde e turquesa do Plantel. Login, acervo, professor e administracao agora compartilham sidebar, cards, formularios, botoes, alertas, estados e modais consistentes, com linguagem simplificada. Navegacao, breadcrumb, retornos, PDF, video, drawer mobile e temas claro/escuro foram revalidados e aprovados pelo responsavel humano. O codigo preservou as regras funcionais e de seguranca das fases anteriores. Nenhum deploy foi realizado.

AJUSTES FUNCIONAIS FINAIS DA V1 implementados na branch `ajuste/funcionalidades-finais` e aguardando validacao humana.

O cadastro passou a solicitar o nome do aluno. Aluno e professor receberam uma area autenticada de suporte por e-mail, e o aluno recebeu um historico pessoal paginado e separado dos eventos brutos de analytics. A retencao dos eventos brutos foi definida em 180 dias por padrao, com agregacao diaria anterior a qualquer exclusao e execucao operacional explicita. Nenhum evento atual foi removido, nenhuma configuracao de producao foi alterada e nenhum deploy foi realizado.

A biblioteca agora possui navegacao por pastas, breadcrumb, busca e filtros no MySQL, paginacao, classificacao conservadora por disciplina e concurso, visualizacao de PDF, reproducao de video com Range e download seguro. Todos os acessos a arquivo partem de `materialId`; o ID do Drive permanece interno ao backend.

O acompanhamento de mudancas do Drive usa Changes API com estado persistido, polling de recuperacao e suporte a canal webhook validado. Criacao, renomeacao, movimentacao e remocao de pastas usam reconciliacao incremental da subarvore quando a operacao pode ser comprovada com seguranca; a sincronizacao completa permanece como fallback. A URL publica HTTPS ainda nao foi definida, portanto a criacao e a renovacao de um canal real permanecem pendentes para o ambiente de producao.

PDF e video sao os unicos tipos funcionais da V1. Os cinco DOCX, dois ODT e cinco PNG observados permanecem somente indexados no MySQL e nao sao expostos para consulta, visualizacao ou download enquanto nao houver decisao humana de escopo.

A base aprovada ate a Fase 8 permanece congelada. Os ajustes funcionais finais ainda nao foram integrados na `main`.

## Repositorio

Repositorio GitHub:
`https://github.com/planteldeduvidas-beep/Plantel-Listas`

Documentacao inicial ja foi versionada no repositorio antes desta atualizacao.

A documentacao 1.1 e a fundacao tecnica da Fase 1 estao integradas na `main`.

A implementacao aprovada da Fase 2 esta integrada na `main`.

A implementacao aprovada da Fase 3 esta integrada na `main`.

A implementacao aprovada da Fase 4 esta integrada na `main`.

A implementacao aprovada da Fase 5 esta integrada na `main`.

A implementacao aprovada da Fase 6 esta integrada na `main`.

A implementacao aprovada da Fase 7 esta integrada na `main`.

A implementacao aprovada da Fase 8 esta integrada na `main`.

## Arquitetura fechada

Backend:
- Node.js;
- Express;
- CommonJS;
- monolito modular por dominio;
- `src/modules` + `src/shared`.

Frontend:
- React;
- Vite;
- JavaScript.

Banco:
- MySQL;
- Laragon + MySQL + MySQL Workbench localmente;
- MySQL Hostinger em producao.

Arquivos:
- Google Drive via Drive API, com OAuth server-side e indexacao de metadados no MySQL implementados na Fase 4;
- arquivos continuam armazenados exclusivamente no Drive.

Producao:
- Hostinger Business Web Hosting.

## Regra obrigatoria para arquivos

O frontend nunca devera enviar `driveFileId` arbitrario para visualizar ou baixar arquivos.

Fluxo obrigatorio:

`materialId` -> MySQL -> validar disponibilidade e autorizacao -> obter `drive_file_id` internamente -> Google Drive.

Essa regra foi implementada na Fase 5 para visualizacao, player e download.

## Regra operacional

O Codex e o programador principal.

Dentro de cada fase autorizada, ele deve executar diretamente tudo que o ambiente permitir, incluindo:

- criar arquivos/estrutura;
- instalar dependencias;
- criar/configurar banco local;
- rodar migrations;
- executar testes;
- corrigir erros;
- versionar a fase em branch/commit;
- gerar relatorio.

O responsavel humano revisa e aprova. O Codex pede intervencao somente para segredo, autorizacao externa ou decisao humana inevitavel.

## Perfis

- aluno;
- professor;
- admin.

Aluno:
- cadastro/login;
- recuperacao de senha;
- navegar, buscar, filtrar, visualizar, assistir e baixar.

Professor:
- tudo do aluno;
- upload/edicao/movimentacao/substituicao/lixeira somente em areas autorizadas;
- sem analytics, relatorios, auditoria geral ou gestao de usuarios/permissoes.

Admin:
- controle administrativo completo, analytics, relatorios e auditoria.

## Drive confirmado

Pasta raiz:
`10Kokm2f3IpeOFuzIJvJDc4HpHZpBoOIX`

Raiz observada:
- LISTAS;
- PROVAS ANTIGAS.

A equipe confirmou que esse e o acervo atual a ser usado no sistema.

## Infraestrutura informada

Hostinger:
- Business Web Hosting;
- dominio `planteldeduvidas.com.br`;
- validade informada ate 17/03/2030.

Email:
- Starter Business Email;
- dominio `planteldeduvidas.com.br`;
- validade informada ate 20/08/2027.

Google Drive:
- conta Gmail comum designada ao acervo;
- cerca de 3 GB usados de 15 GB, conforme informacao recebida.

## Pendencias para as proximas fases

- definir URL/subdominio final do sistema;
- cadastrar a URL HTTPS publica exata do webhook do Google Drive e validar o canal real em producao;
- definir o remetente definitivo de producao para recuperacao de senha;
- definir a URL de producao para cadastrar a redirect URI OAuth definitiva;
- configurar o OAuth para producao e cumprir a verificacao aplicavel ao scope restrito `drive` depois da Fase 6;
- avaliar a exigencia de seguranca independente vigente antes da producao;
- validar o fluxo OAuth e a indexacao no ambiente de producao somente na fase de deploy autorizada;
- avaliar otimizacao controlada da leitura de arvores muito grandes, preservando limites da API;
- validar limite pratico de videos na Hostinger antes do go-live;
- definir estrategia exata de migration no deploy Hostinger antes da Fase 9.
- agendar a rotina de retencao dos eventos de uso no ambiente definitivo, mantendo o valor configurado e a agregacao anterior a exclusao;
- medir as agregacoes de analytics no banco de producao quando o deploy for autorizado.

## Proxima acao

1. Concluir a validacao humana dos ajustes funcionais finais da V1.
2. Nao integrar a branch, fazer deploy nem iniciar a Fase 9 sem autorizacao explicita.
