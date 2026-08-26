# ESTADO ATUAL DO PROJETO - PLANTEL LISTAS

Versao da documentacao: 1.1
Atualizado em: 26/08/2026

## Status

FASE 0 concluida: documentacao e preparacao inicial.

FASE 1 aprovada pelo responsavel humano e integrada na branch `main`.

FASE 2 aprovada pelo responsavel humano e integrada na branch `main`.

O fechamento tecnico e o merge seguro foram concluidos. Nenhum deploy foi realizado.

A V1 esta funcionalmente congelada.

## Repositorio

Repositorio GitHub:
`https://github.com/planteldeduvidas-beep/Plantel-Listas`

Documentacao inicial ja foi versionada no repositorio antes desta atualizacao.

A documentacao 1.1 e a fundacao tecnica da Fase 1 estao integradas na `main`.

A implementacao aprovada da Fase 2 esta integrada na `main`.

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
- Google Drive via Drive API.

Producao:
- Hostinger Business Web Hosting.

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
- configurar Google Cloud/Drive API na Fase 4;
- validar escopo OAuth e status de producao na Fase 4/9;
- validar limite pratico de videos na Hostinger antes do go-live;
- definir estrategia exata de migration no deploy Hostinger antes da Fase 9.

## Proxima acao

1. Aguardar autorizacao explicita para iniciar a Fase 3.
2. Nao realizar deploy sem autorizacao explicita.
