# ESTADO ATUAL DO PROJETO - PLANTEL LISTAS

Versao da documentacao: 1.1
Atualizado em: 27/08/2026

## Status

FASE 0 concluida: documentacao e preparacao inicial.

FASE 1 aprovada pelo responsavel humano e integrada na branch `main`.

FASE 2 aprovada pelo responsavel humano e integrada na branch `main`.

O fechamento tecnico e o merge seguro foram concluidos. Nenhum deploy foi realizado.

FASE 3 aprovada pelo responsavel humano e integrada na branch `main`.

Categorias, disciplinas, concursos, acessos de professor por pasta e a revisao de UX foram aprovados. Nenhum deploy foi realizado.

FASE 4 aprovada pelo responsavel humano e integrada na branch `main`.

A integracao OAuth server-side, a indexacao administrativa e a sincronizacao idempotente do Google Drive foram validadas localmente com o acervo real. A sincronizacao longa foi desacoplada da requisicao HTTP, possui status persistido, polling no frontend e recuperacao de interrupcoes. Nenhum deploy foi realizado.

O Google OAuth esta atualmente em modo `Testing`. Como o sistema utiliza `drive.readonly`, a autorizacao e o refresh token da conta de teste expiram apos aproximadamente sete dias e podem exigir reconexao. Isso e comportamento esperado do ambiente de teste, nao falha do Plantel Listas. Antes do uso definitivo sera necessario configurar o OAuth para producao e cumprir o processo de verificacao aplicavel a esse scope.

A V1 esta funcionalmente congelada.

## Repositorio

Repositorio GitHub:
`https://github.com/planteldeduvidas-beep/Plantel-Listas`

Documentacao inicial ja foi versionada no repositorio antes desta atualizacao.

A documentacao 1.1 e a fundacao tecnica da Fase 1 estao integradas na `main`.

A implementacao aprovada da Fase 2 esta integrada na `main`.

A implementacao aprovada da Fase 3 esta integrada na `main`.

A implementacao aprovada da Fase 4 esta integrada na `main`.

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

## Regra obrigatoria para arquivos na Fase 5

O frontend nunca devera enviar `driveFileId` arbitrario para visualizar ou baixar arquivos.

Fluxo obrigatorio:

`materialId` -> MySQL -> validar disponibilidade e autorizacao -> obter `drive_file_id` internamente -> Google Drive.

Download e player ainda nao foram implementados.

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
- definir o remetente definitivo de producao para recuperacao de senha;
- definir a URL de producao para cadastrar a redirect URI OAuth definitiva;
- configurar o OAuth para producao e cumprir a verificacao aplicavel ao scope `drive.readonly`;
- validar o fluxo OAuth e a indexacao no ambiente de producao somente na fase de deploy autorizada;
- avaliar otimizacao controlada da leitura de arvores muito grandes, preservando limites da API;
- validar limite pratico de videos na Hostinger antes do go-live;
- definir estrategia exata de migration no deploy Hostinger antes da Fase 9.

## Proxima acao

1. Aguardar autorizacao explicita para iniciar a Fase 5.
2. Nao iniciar a Fase 5 sem autorizacao explicita.
3. Nao realizar deploy sem autorizacao explicita.
