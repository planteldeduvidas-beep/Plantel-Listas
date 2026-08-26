# LEIA PRIMEIRO - PLANTEL LISTAS

Versao da documentacao: 1.1
Data-base: 26/08/2026
Status: V1 funcionalmente congelada

## Regra de continuidade

Este repositorio deve ser autossuficiente em contexto. O chat, a conta e a memoria de uma sessao do Codex NAO sao a fonte de verdade.

Antes de alterar qualquer codigo, qualquer nova sessao/conta do Codex deve:

1. Ler integralmente `docs/PLANTEL_LISTAS_PROMPT_MASTER_CODEX.md`.
2. Ler `docs/ESTADO_ATUAL_DO_PROJETO.md`.
3. Ler `docs/Manual_Tecnico_Plantel_Listas_V1.pdf` quando precisar de visao humana consolidada.
4. Ler o ultimo relatorio existente em `docs/relatorios/`, se essa pasta ja existir.
5. Inspecionar o repositorio, branch atual, package.json, migrations e testes existentes.
6. Confirmar em poucas linhas a fase atual e o plano da fase autorizada.
7. So entao executar a fase.

## Autoridade dos documentos

Ordem de autoridade:

1. Regras de negocio e escopo aprovados no Prompt Master / Manual Tecnico.
2. Estado Atual do Projeto.
3. Codigo + migrations + testes aprovados.
4. Relatorios de fase.
5. Historico de chat, apenas como apoio.

Se houver conflito, NAO invente uma solucao. Registre o conflito e pare a parte afetada ate receber decisao humana.

## Regra operacional do Codex

O Codex e o programador principal. O responsavel humano atua como revisor/validador.

Se uma tarefa estiver dentro da fase autorizada e o ambiente permitir, o Codex deve EXECUTAR, e nao apenas ensinar o usuario a executar. Isso inclui, quando aplicavel:

- criar pastas e arquivos;
- inicializar/configurar packages;
- instalar dependencias necessarias da fase;
- criar/configurar o banco MySQL local;
- executar migrations;
- iniciar backend/frontend;
- executar testes;
- corrigir erros encontrados;
- analisar dependencias;
- criar commit da fase;
- enviar a branch da fase ao GitHub, se as credenciais ja estiverem disponiveis.

O Codex so deve pedir intervencao humana quando houver algo que realmente dependa do usuario, por exemplo:

- segredo/senha nao disponivel no ambiente;
- autorizacao OAuth no navegador;
- acesso ao painel Hostinger;
- decisao de negocio;
- aprovacao para merge/deploy/acao destrutiva.

Nunca pedir a senha da conta Google do Drive.

## Fluxo obrigatorio

ANALISAR -> PLANEJAR -> EXECUTAR -> TESTAR -> CORRIGIR -> RELATAR -> PARAR

Nao iniciar a fase seguinte sem aprovacao explicita.
