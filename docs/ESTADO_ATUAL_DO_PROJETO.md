# ESTADO ATUAL DO PROJETO - PLANTEL LISTAS

Versao da documentacao: 1.1
Atualizado em: 26/08/2026

## Status

FASE 0 concluida: documentacao e preparacao inicial.

Proxima fase autorizavel: FASE 1 - fundacao tecnica.

A V1 esta funcionalmente congelada.

## Repositorio

Repositorio GitHub:
`https://github.com/planteldeduvidas-beep/Plantel-Listas`

Documentacao inicial ja foi versionada no repositorio antes desta atualizacao.

A documentacao 1.1 deve substituir a anterior antes de iniciar a Fase 1.

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

## Pendencias que nao bloqueiam a Fase 1

- definir URL/subdominio final do sistema;
- definir endereco remetente para recuperacao de senha;
- configurar Google Cloud/Drive API na Fase 4;
- validar escopo OAuth e status de producao na Fase 4/9;
- validar limite pratico de videos na Hostinger antes do go-live;
- definir estrategia exata de migration no deploy Hostinger antes da Fase 9.

## Proxima acao

1. Substituir os documentos antigos pelos documentos v1.1.
2. Enviar ao Codex `PROMPT_INICIAL_CODEX_FASE_1.md`.
3. Codex cria branch de Fase 1 e executa a fase.
4. Codex gera `docs/relatorios/RELATORIO_FASE_01.md` e para.
5. Responsavel traz o relatorio para auditoria antes de qualquer merge em `main` ou Fase 2.
