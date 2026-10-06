# Proteção de alunos menores — ajuste documental de 06/10/2026

## Escopo concluído

- Seções específicas nos Termos e na Privacidade; orientação na FAQ do aluno.
- Versões dos dois documentos em `shared/documentosLegais.json`; a data pública usa a mesma fonte.
- Faixa etária declarada, sem data de nascimento, CPF, documentos, biometria ou dados do responsável. A declaração não é verificação.
- Novos cadastros públicos exigem uma das três opções; não existe proibição por ser menor. Cadastros pendentes antigos sem faixa continuam confirmáveis.
- Alunos existentes sem faixa veem uma pergunta obrigatória antes da montagem do painel (inclusive antes de Termos/boas-vindas), sem fechar ou adiar. Falha de consulta/salvamento permite retentar, sem desativar a conta. Quem já tem faixa não recebe a pergunta. Professores e admins não recebem esse fluxo.
- `GET/POST /api/autenticacao/faixa-etaria`: sessão, CSRF na escrita e limite existente de alterações da conta; apenas a própria conta de aluno, sem parâmetro de usuário.
- Migrations 032, 033 e 034 aditivas, sem backfill: faixa, data e origem (cadastro/coleta_obrigatoria/perfil/admin). Atualização e auditoria na mesma transação. Auditoria restrita guarda faixa anterior/nova, origem, ator e horário; correção administrativa exige justificativa. Os valores não são copiados ao logger HTTP.
- Menores não alteram diretamente a faixa, nem pelo perfil nem pelo endpoint antigo, mesmo esperando dias. Podem atualizar nome com a mesma faixa e pedir revisão no Suporte. Quem declarou 18+ pode corrigir para menor; depois não pode voltar sozinho para 18+. A revisão humana do administrador é o fluxo controlado, não uma aferição documental. Salvar a mesma faixa é idempotente e a declaração não altera permissões de estudo.
- Meu perfil, exclusivo do aluno: nome, e-mail/confirmação, faixa/data/origem e data de criação. Última entrada não é mostrada nem enviada pelo endpoint de perfil; os registros internos de acesso são preservados. Edita apenas nome e faixa na própria conta. GET/POST /api/autenticacao/perfil com sessão, CSRF na escrita, rate limit existente e whitelist explícita.
- E-mail reutiliza o fluxo atual: senha atual, confirmação do novo endereço, proteção contra duplicidade. O e-mail antigo permanece até confirmação; não houve mudança na integração SMTP.
- Administração: Usuários → Opções → Revisar faixa etária. GET/POST /api/usuarios/:usuarioId/faixa-etaria somente para administrador autenticado, CSRF, rate limit de conta e justificativa de 5–500 caracteres. Contas da equipe não são alvos dessa correção.
- Proteção de publicidade aplicada a todos, inclusive menores: parceiros não são selecionados por idade, buscas, cliques ou histórico; nenhum perfil publicitário ou compartilhamento desses dados com parceiros foi acrescentado. Links e cupons mantidos, com indicação de site externo/nova aba. Não há uma nova configuração comercial menos protetiva para adultos.
- Nenhuma permissão, histórico, arquivo ou registro de aceite anterior é alterado. Apenas a faixa e a data da declaração são gravadas quando o aluno escolhe uma opção.
- A nova versão utiliza o aviso de aceite existente, que permite adiar; não bloqueia login nem registra aceite retroativo. Novos cadastros devem usar a versão atual, como antes.
- Não houve implementação de aferição de idade, supervisão parental ou consentimento parental verificável. Atualização documental não é certificação de conformidade.

## Orientação para atendimento humano

1. Receber dúvidas de alunos e responsáveis no contato de privacidade já divulgado.
2. Não pedir senha, código de confirmação, link de acesso ou documento no primeiro contato.
3. Não fornecer histórico, dados ou acesso à conta a alguém apenas porque declara ser responsável.
4. Antes de atender uma solicitação sobre dados de terceiros, definir verificação proporcional de identidade e legitimidade, com orientação jurídica; não improvisar coleta de documentos nem autorizar troca de e-mail para transferir uma conta.
5. Registrar a solicitação e seu encaminhamento com acesso restrito e minimização de dados, sem presumir que o formulário público prova identidade.

## Pendências que exigem definição antes de implementação

- Identificar público e faixas etárias efetivamente atendidas, inclusive acesso provável por menores.
- Avaliar LGPD art. 14 e ECA Digital para este serviço, incluindo conteúdo educacional, histórico, métricas e publicidade dos parceiros.
- Definir bases legais por finalidade e, quando aplicável, consentimento parental específico e verificável; não presumir que consentimento é a única base nem que confirmação do e-mail do aluno o substitui.
- Escolher mecanismo proporcional de aferição de idade e eventuais ferramentas de acompanhamento, de acordo com a regulamentação aplicável. Autodeclaração não comprova idade.
- Validar operacionalmente a coleta obrigatória solicitada, sem exclusão ou suspensão permanente de contas. A pergunta bloqueia somente a entrada no painel enquanto não respondida; não é um mecanismo de aferição documental de idade nem uma autorização parental.
- Revisar com a operação os prazos de retenção, direitos dos titulares, fornecedores, transferências internacionais e resposta a incidentes; esses pontos da auditoria anterior não foram resolvidos por esta alteração documental.
- Guardar evidência da versão integral dos documentos publicados (Git), além do registro de aceite no banco. Não apagar aceites antigos ao atualizar a versão.

## Fontes oficiais

- LGPD: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm
- ECA Digital: https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/l15211.htm
- Orientações da ANPD: https://www.gov.br/anpd/pt-br/assuntos/eca-digital/

## Validação e entrega local

- `DB_TEST_NAME=plantel_gmail_transicao_qa npm run check`: 297/297 backend, 5/5 PWA, build Vite aprovado.
- `node --test frontend/test/*.test.js`: 33/33 aprovados. Aviso de porta HMR 24678 ocupada nos testes SSR não impediu execução.
- Regressões: cadastro nas três faixas, conta legada sem faixa, pendência antiga, idempotência, própria conta/whitelist/CSRF, equipe bloqueada, menor sem alteração direta inclusive após 25 horas, adulto que passa a menor sem retorno autônomo, correção admin/justificativa, faixas anterior/nova na auditoria, rollback, sessão mantida e confirmação de novo e-mail/duplicidade preservadas.
- Inspeção visual dos componentes reais em servidor de QA com dados fictícios em memória (sem banco, SMTP ou Drive): modal desktop/mobile 390 px, Escape sem fechamento, salvar e recarregar sem repetir modal, nome editável, faixa de menor desabilitada e link para Suporte; sem overflow horizontal. PWA verificado pela suíte, não por um aparelho instalado real.
- Migrations 032–034 aplicadas somente no MySQL local de QA, não em produção. Sem commit, push ou deploy. Branch: security/camada-ativa; alterações locais preservadas.
- O modal bloqueia a montagem do painel em qualquer URL enquanto a declaração está ausente. O backend também exige a faixa do aluno nas APIs de biblioteca, conteúdo, download e histórico, respondendo `403 / FAIXA_ETARIA_OBRIGATORIA` antes da operação. Login, declaração, perfil, suporte e saída continuam disponíveis; admin/professor não recebem essa exigência. Não é mecanismo documental de aferição. Publicidade usa a proteção comum já existente, sem segmentação por idade.
- Revisão final em interface completa com API e MySQL reais locais, contas fictícias e SMTP fake: URL direta de histórico/biblioteca sem faixa mantém popup; salvar libera painel; recarga não repete; perfil de menor bloqueia alteração; correção admin de 12–17 para 18+ salva e registra ator, anterior/nova faixa, data e justificativa; novo login preservado; adulto que declara menor volta a ter campo protegido. Mobile sem overflow (375 px úteis). Foi corrigido o encolhimento do modal na combinação do CSS do build completo.
- QA manual reproduzível: `backend/scripts/qaPerfilReal.cjs`, somente loopback, banco fixo `plantel_gmail_transicao_qa`, sem envio real de e-mail ou Drive. Exige build com `VITE_API_URL=http://127.0.0.1:5190/api`; credenciais são exclusivamente fictícias. Nunca usar contas reais nesse servidor.

### Ajuste de interface — popup unificado

- Aluno existente sem faixa vê a pergunta obrigatória antes do painel. Termos pendentes são mostrados no mesmo popup; o aceite é salvo ao marcar a caixa, sem abrir links ou clicar em confirmação extra. Faixa exige seleção e Continuar.
- Aceites e faixas já registrados não são solicitados novamente. Termos continuam adiáveis; optar por preencher apenas a faixa não gera outro popup de termos imediatamente, mesmo sem armazenamento local disponível (estado compartilhado em memória).
- Interface antiga/versão divergente não aceita os documentos silenciosamente: disponibiliza Atualizar página. Erro no salvamento desmarca a caixa e permite nova tentativa, sem fingir sucesso.
- Verificação visual com API/MySQL local: conta legada com ambas as pendências, checkbox salva um aceite com faixa ainda nula, faixa libera painel, adiamento não registra aceite, nenhum segundo popup de termos; layout móvel 390 px sem overflow. QA manual com `QA_TERMOS_PENDENTES=1` não pré-aceita os documentos da conta fictícia.

### Arquivos do escopo (novos ou alterados)

- Backend: `src/app.js`; `src/modules/autenticacao/{autenticacaoController.js,autenticacaoRoutes.js,cadastroPendenteRepository.js,cadastroPendenteService.js,faixaEtariaService.js}`; `src/modules/usuarios/{usuarioController.js,usuarioRoutes.js}`; migrations `032_faixa_etaria_declarada.sql`, `033_origem_faixa_etaria.sql`, `034_correcao_faixa_etaria_admin.sql`.
- Testes backend: `test/autenticacao.integracao.test.js`, `test/adminAnalyticsAuditoria.integracao.test.js`, `test/emailUnico.integracao.test.js` (fixtures de cadastro atualizados).
- Frontend: `src/{App.jsx,PainelAcervo.jsx,MeuPerfil.jsx,ExigirFaixaEtariaAluno.jsx,FaixaEtariaAluno.jsx,CorrecaoFaixaEtariaAdmin.jsx,AdministracaoFase7.jsx,MenuUsuario.jsx,Suporte.jsx,ParceirosSidebar.jsx,Tutorial.jsx,PaginaInstitucional.jsx,api.js,navegacao.js,duvidasSuporte.js,faixaEtaria.css}`.
- Testes frontend: `test/faixaEtariaAluno.test.js`, `test/termosAluno.test.js`; fixtures locais `test/fixtures/{perfilAluno.html,perfilAluno.jsx,servidorPerfilVisual.mjs}`. Fixtures não entram no build público e seu servidor só escuta loopback, quando iniciado manualmente.
- Compartilhados: `shared/faixasEtarias.json`, `shared/documentosLegais.json`; documentação: este arquivo. Evidência visual fictícia: `artifacts/qa-perfil/perfil-desktop.jpg`.
- Alterações anteriores preservadas, fora desta regra: remoção do texto solicitado de `frontend/src/AjudaConta.jsx` e ajuste de `frontend/test/ajudaConta.test.js`.
