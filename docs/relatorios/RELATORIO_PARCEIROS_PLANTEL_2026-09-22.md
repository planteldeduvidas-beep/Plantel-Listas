# Relatorio tecnico — Parceiros Plantel

Data: 22/09/2026

Branch: `fase/09-qa-producao`

Base anterior: `d28c55d69b9fea929d8b2844b0855e269595f76b`
Estado: implementado e testado localmente; **nao publicado**.

## Resultado

Foi criado um card compacto no fim da navegacao lateral, compartilhado por aluno, professor e administrador. Ele exibe um parceiro ativo por vez, na ordem definida pelo administrador. Sem parceiros ativos, o card nao aparece. Os dados nao estao hardcoded e nao ha cadastro inicial de parceiros em producao.

A nova area `Parceiros` do administrador permite cadastrar, editar, ativar/arquivar, ordenar e alterar/remover o logo. Cupom, desconto e texto do botao sao opcionais. Os links externos abrem em nova aba com `noopener noreferrer`; nao ha checkout, Kiwify ou rastreamento de compra.

## Arquitetura e arquivos

- Migration `backend/migrations/016_parceiros_plantel.sql`: tabela InnoDB `parceiros_plantel` com identidade, descricao, URL HTTPS, campos promocionais opcionais, estado, ordem, imagem binaria e timestamps. A imagem e armazenada no MySQL com limite de 512 KB; o upload preexistente para Drive usa arquivos temporarios e nao serviria para um logo permanente.
- Backend `backend/src/modules/parceiros/`: `parceiroRoutes.js` → `parceiroController.js` → `parceiroService.js` → `parceiroRepository.js`, mais `parceiroValidator.js`.
- Integracao em `backend/src/app.js` e `frontend/src/api.js`.
- UI `frontend/src/ParceirosSidebar.jsx`, `frontend/src/ParceirosAdmin.jsx`, alteracoes em `PainelAcervo.jsx`, `ComponentesInterface.jsx`, `navegacao.js` e `styles.css`.
- Testes `backend/test/parceiroValidator.test.js`, `backend/test/parceiros.integracao.test.js` e ajuste de `backend/test/navegacaoFrontend.test.js`.

## API, autorizacao e seguranca

| Endpoint | Acesso | Finalidade |
| --- | --- | --- |
| `GET /api/parceiros` | sessao autenticada | lista apenas ativos, ordenados |
| `GET /api/parceiros/admin` | admin | lista completa |
| `GET /api/parceiros/:id/imagem` | sessao; inativos so para admin | logo com tipo seguro e `nosniff` |
| `POST /api/parceiros` | admin + CSRF | cadastro |
| `PATCH /api/parceiros/:id` | admin + CSRF | edicao, ativacao e arquivo |
| `POST /api/parceiros/:id/imagem` | admin + CSRF + rate limit | upload/substituicao |
| `DELETE /api/parceiros/:id/imagem` | admin + CSRF | remove logo |

Entradas usam allowlist de campos, IDs inteiros validos, limites de comprimento e rejeicao de HTML simples. URL exige HTTPS, hostname publico, sem credenciais, IP, host local ou controle. Logos aceitam somente PNG/JPEG/WebP com MIME coerente e assinatura binaria verificada, ate 512 KB. O navegador renderiza texto como texto React, sem `dangerouslySetInnerHTML`. Mutacoes e seus registros em `auditoria_geral` compartilham transacao MySQL.

## Carrossel, responsividade e acessibilidade

Rotacao a cada 6,5 segundos com transicao leve; botoes anterior/proximo e pontos permitem escolha manual. A interacao reinicia o temporizador. O card pausa em hover, foco e aba oculta; `prefers-reduced-motion` desliga rotacao automatica e animacao. Links, imagens e controles possuem rotulos/alt; ha foco visivel. Falha/ausencia do logo produz inicial do nome.

A sidebar existente vira menu rolavel em larguras menores. A pre-visualizacao local confirmou desktop, 390×844 e 768×1024 px, temas claro e escuro, card completo no menu movel, ausencia de rolagem horizontal nos dois viewports menores e navegacao manual. Um problema de contraste do titulo no card foi corrigido durante a revisao visual. Os dados e a conta temporarios da pre-visualizacao foram removidos do banco `plantel_listas_test`.

## Verificacoes

- `npm run check`: 139 testes backend aprovados e build Vite aprovado (35 modulos).
- Integracao: aluno e professor recebem lista ativa ordenada, nao acessam administracao; admin cria/edita/arquiva, envia/remove imagem; CSRF, URL invalida, XSS simples, mass assignment, MIME falso e auditoria verificados.
- `npm audit --omit=dev`: 0 vulnerabilidades.
- `git diff --check`: sem erro de whitespace (somente aviso de conversao LF/CRLF no Windows).
- Navegador local: rotacao automatica observada, navegacao manual e visual responsivo conferidos. O clique de copiar cupom esta implementado com feedback, mas nao foi exercitado em teste automatizado de navegador.
- Nao foi usado Google Drive real; nao houve alteracao de dados de producao, push, merge ou deploy.

## Limites e pendencias

- Nenhum parceiro real foi cadastrado: o administrador deve validar logos, URLs, textos e eventuais beneficios antes de ativar registros em producao.
- A migration 016 foi aplicada somente ao banco local isolado de testes. Ela deve ser aplicada em producao apenas durante deploy autorizado.
- O analytics existente registra eventos do acervo e nao oferece evento generico reaproveitavel para clique externo. Nao foi criada tabela ou rastreamento novo apenas para parceiros.
- A ideia posterior de uma faixa de noticias em movimento **nao integra este modulo**. Ela exigiria definir fonte, autoria e ciclo de vida dos avisos; a recomendacao visual e posiciona-la sob o cabecalho da biblioteca, nunca como barra fixa que cubra materiais.
- Convem fazer validacao humana final com marcas reais, especialmente legibilidade de logos e textos longos, antes de qualquer publicacao.

## Git e entrega

Branch: `fase/09-qa-producao`. O hash do commit da entrega e informado na resposta final, pois este relatorio faz parte do proprio commit. O estado de `git status` tambem e informado ao final. **Nenhum deploy foi executado.**
