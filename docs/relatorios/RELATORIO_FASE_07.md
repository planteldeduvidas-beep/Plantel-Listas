# RELATORIO DA FASE 07 - ADMINISTRACAO, ANALYTICS E AUDITORIA

Data: 27/08/2026
Estado: **PRONTA PARA VALIDACAO HUMANA**

## 1. Resumo

A Fase 7 completou o nucleo administrativo da V1 com gestao de usuarios, papeis, acessos de professores, analytics, relatorio CSV e historico geral de atividades. O backend permanece como autoridade para sessao, estado da conta, papel e autorizacao especifica.

O painel usa linguagem simples e separa as areas `Usuarios`, `Estatisticas` e `Historico de atividades`. IDs, nomes de tabela, endpoints, hashes, tokens e outros conceitos internos nao sao exibidos.

Nao houve alteracao destrutiva de usuarios ou materiais reais, merge em `main`, deploy ou inicio da Fase 8.

## 2. Branch e commits

- Branch: `fase/07-admin-analytics-auditoria`.
- Base: `main` no commit `2767bcf`, com as Fases 1 a 6 integradas e o fechamento documental da Fase 6 corrigido.
- Commit tecnico: `33a046f` - `feat: implementa administracao e analytics da fase 7`.
- A documentacao de estado e este relatorio estao versionados na mesma branch.
- Nenhum merge em `main` foi realizado.
- Nenhum deploy foi realizado.

## 3. Gestao de usuarios

O administrador pode:

- listar usuarios com paginacao;
- pesquisar por e-mail;
- filtrar por tipo e estado da conta;
- criar aluno, professor ou administrador com senha temporaria validada e armazenada somente como hash Argon2id;
- editar o e-mail permitido;
- alterar o tipo entre aluno, professor e administrador;
- liberar ou bloquear a conta;
- iniciar o fluxo existente de redefinicao de senha por e-mail.

O contrato publico usa somente os campos necessarios e nunca retorna hash de senha, sessao, token ou secret. Campos adicionais sao recusados para impedir mass assignment.

## 4. Papeis e protecao administrativa

- os papeis oficiais continuam `aluno`, `professor` e `admin`;
- todas as rotas administrativas exigem sessao ativa e papel de administrador no backend;
- aluno e professor recebem HTTP 403 ao tentar acessar essas rotas;
- o administrador nao pode remover o proprio papel nem bloquear a propria conta;
- a ultima conta administrativa ativa nao pode ser bloqueada nem deixar de ser administradora;
- mudancas de papel e bloqueio revogam sessoes quando necessario;
- a operacao usa trava nomeada do MySQL para serializar decisoes sensiveis sobre administradores.

Quando um professor passa para outro papel, todas as permissoes ativas de pasta sao revogadas na mesma operacao e suas sessoes sao encerradas. Assim, o acesso anterior deixa de funcionar imediatamente.

## 5. Acessos dos professores

O painel mantem o fluxo simples:

`Professor -> Pastas que pode gerenciar`

O administrador escolhe o professor, marca as pastas e usa `Salvar acessos`. O frontend envia a lista selecionada em uma unica requisicao e o backend valida previamente professor e pastas antes de aplicar a alteracao em transacao.

A operacao aceita ate 200 pastas, recusa duplicidades e entradas invalidas, preserva a heranca de permissoes ja implementada e tem efeito imediato. A interface mostra nomes e caminhos, sem exigir IDs tecnicos do usuario.

## 6. Definicao dos eventos de uso

O rastreamento minimo da V1 foi definido assim:

- `visualizacao`: primeira entrega bem-sucedida do conteudo de um material para o mesmo usuario no dia;
- `download`: primeira entrega bem-sucedida como anexo para o mesmo usuario e material em cada minuto;
- `acesso`: consulta de uma pasta ou da raiz pelo mesmo usuario em cada hora;
- `busca`: uma pesquisa normalizada por usuario e termo em cada dia.

Chaves unicas tornam a deduplicacao idempotente. Buscas sao limitadas a 120 caracteres; a chave usa hash parcial do termo normalizado. Nao sao registrados IP, token, secret, corpo de arquivo, cabecalho de autorizacao ou conteudo privado.

## 7. Analytics

O painel, exclusivo de administrador, apresenta:

- total de materiais disponiveis, PDFs e videos;
- total de usuarios, alunos, professores, administradores e contas ativas;
- materiais por disciplina e concurso, respeitando classificacao herdada;
- acessos, alunos ativos, visualizacoes e downloads por dia;
- materiais mais usados no periodo;
- materiais adicionados recentemente;
- termos mais pesquisados;
- pastas mais acessadas;
- atividade administrativa do acervo.

Os periodos permitidos sao 7, 30 e 90 dias. Consultas usam agregacoes no MySQL, limites fixos e indices; o frontend nunca carrega eventos brutos para produzir as metricas.

## 8. Relatorio administrativo

Foi adicionada uma exportacao CSV simples e autenticada com os totais principais do painel. A resposta usa codificacao UTF-8, nome controlado e nao inclui IDs, tokens ou dados internos. Nao foi criado PDF, BI externo ou infraestrutura adicional.

## 9. Auditoria geral

O historico administrativo unifica, somente para leitura:

- criacao e edicao de usuario;
- mudanca de papel e estado da conta;
- redefinicao administrativa iniciada;
- concessao, revogacao e salvamento em lote dos acessos de professor;
- upload, edicao, movimentacao, substituicao, lixeira, restauracao e exclusao de material registrados na Fase 6;
- classificacao de pastas;
- sincronizacoes do Google Drive.

Cada item publico informa acao, autoria, data, resultado e descricao amigavel. IDs de entidades e contexto tecnico permanecem internos e nao sao devolvidos pela API de consulta.

Nao existe rota comum para editar, excluir ou alterar autoria/data. A interface trata a auditoria como historico imutavel e oferece somente busca, filtro por acao e paginacao.

## 10. Endpoints

Usuarios, somente admin:

- `GET /api/usuarios`;
- `POST /api/usuarios`;
- `PATCH /api/usuarios/:usuarioId`;
- `PATCH /api/usuarios/:usuarioId/papel`;
- `PATCH /api/usuarios/:usuarioId/ativo`;
- `POST /api/usuarios/:usuarioId/redefinicao-senha`.

Acessos de professor:

- `PUT /api/permissoes/professores/:professorId` - salvamento atomico da selecao, somente admin e CSRF;
- as consultas e operacoes individuais anteriores foram preservadas para compatibilidade.

Analytics e historico, somente admin:

- `GET /api/analytics`;
- `GET /api/analytics/relatorio.csv`;
- `GET /api/auditoria`.

Todas as rotas mutaveis exigem CSRF. Analytics e auditoria nao possuem endpoints mutaveis.

## 11. Banco, migrations e indices

`011_admin_analytics_auditoria.sql` criou:

- `eventos_uso_acervo`, com deduplicacao unica, FKs para usuario/material e indices por tipo, material, usuario e data;
- `auditoria_geral`, com autoria opcional preservada por `ON DELETE SET NULL`, resultado, contexto interno minimo e indices por data, acao, ator e entidade;
- indices administrativos para usuarios e materiais recentes.

`012_analytics_buscas_acessos.sql` ampliou os eventos para acesso e busca, tornou material opcional nesses eventos, vinculou pasta por FK e adicionou indices para pasta e termos pesquisados.

As duas migrations foram aplicadas no MySQL local e no banco isolado de testes. O executor reconhece execucoes posteriores sem duplicacao.

## 12. Seguranca

- sessao, estado do usuario e papel sao validados no backend;
- CSRF cobre todas as novas mutacoes;
- SQL usa parametros e filtros/periodos ficam em allowlists;
- paginacao aceita no maximo 100 usuarios ou eventos por pagina;
- lote de acessos aceita no maximo 200 pastas;
- alteracoes administrativas criticas usam transacao e trava;
- bloqueio e mudanca de papel revogam sessoes;
- revogacao de professor remove acessos imediatamente;
- respostas privadas usam `no-store`;
- nenhuma senha, hash, sessao, token ou secret entra em analytics ou auditoria publica;
- nao existem rotas de alteracao ou exclusao da auditoria.

## 13. UX

O painel foi organizado para administradores leigos, com:

- abas simples;
- busca e filtros por nomes conhecidos;
- `Tipo de usuario`, `Conta liberada/bloqueada` e `Redefinir senha`;
- criacao de usuario em formulario recolhido;
- selecao de pastas por nome e salvamento unico;
- cartoes numericos e listas curtas para estatisticas;
- estados vazios e mensagens de sucesso/erro;
- historico com autoria, momento, descricao e resultado.

Nao foi realizado o acabamento visual definitivo reservado para a Fase 8.

## 14. Testes automatizados

Resultado final: **92 testes aprovados, 0 falhas**.

Os quatro cenarios integrados adicionados cobrem, entre outros pontos:

- criacao, listagem, busca e filtros de usuarios;
- limite de paginacao, entrada hostil, usuario inexistente e mass assignment;
- protecao do proprio admin, bloqueio e revogacao imediata de sessao;
- aluno/professor impedidos nas rotas administrativas;
- redefinicao administrativa;
- selecao atomica de multiplas pastas e revogacao imediata;
- remocao do papel de professor com revogacao de acessos e sessoes;
- contagens de PDF, visualizacao, download, acesso, aluno ativo, busca e pasta acessada;
- periodos invalidos e exclusividade de admin;
- autoria, resultado, filtro e paginacao da auditoria;
- ausencia de senha, IDs/contexto internos e endpoints de mutacao no historico.

Os 88 testes das Fases 1 a 6 permaneceram aprovados.

## 15. Checks finais

- `npm run check`: aprovado, 92 testes e build Vite com 28 modulos;
- `npm audit`: 0 vulnerabilidades;
- `npm audit --omit=dev`: 0 vulnerabilidades;
- `git diff --check`: aprovado;
- build frontend: aprovado.

Os checks foram executados sem servidores de desenvolvimento concorrentes. Uma execucao anterior sofreu interferencia de um Vite ainda ativo; depois de encerrar o processo, a regressao isolada passou integralmente e de forma repetivel.

## 16. Testes com dados e validacao visual

Os testes funcionais usam o banco isolado `plantel_listas_test`, recriam somente registros temporarios identificados pelo cenario e os removem ao encerrar. Nenhum usuario, material ou evento real foi alterado de forma destrutiva.

O build e os contratos HTTP foram validados. Nao havia navegador integrado disponivel na sessao para uma verificacao visual automatizada; por isso a experiencia completa permanece explicitamente para validacao humana.

## 17. Secrets e Git

- `backend/.env` e `frontend/.env` continuam ignorados;
- nenhum `.env` real aparece no historico Git;
- nenhum arquivo de credencial foi versionado;
- senhas, hashes, refresh tokens, access tokens, client secret, senha SMTP e tokens de sessao nao aparecem no relatorio ou no frontend;
- a branch da fase esta separada da `main` e sera enviada ao remoto sem force push.

## 18. Riscos e pendencias

- validar no navegador os fluxos de usuario, acessos, estatisticas, CSV e historico;
- confirmar a compreensao dos textos por um administrador leigo;
- acompanhar o crescimento de `eventos_uso_acervo` e definir retencao operacional antes de uma escala que a exija; nenhuma limpeza foi criada sem regra explicita;
- medir agregacoes no banco de producao quando o deploy for autorizado;
- manter as pendencias de URL, OAuth, webhook e Hostinger ja registradas no estado do projeto.

## 19. Estado final

**PRONTA PARA VALIDACAO HUMANA**

A Fase 7 permanece somente na branch `fase/07-admin-analytics-auditoria`. Nao houve merge, deploy nem inicio da Fase 8.
