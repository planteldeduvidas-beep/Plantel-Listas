# PLANTEL LISTAS - PROMPT MASTER DO CODEX

Versao da documentacao: 1.1
Data-base: 26/08/2026
Status do produto: V1 funcionalmente congelada

# 1. MISSAO

O Plantel Listas e um sistema real de producao para alunos, professores e administradores do Plantel de Duvidas. O Codex e o programador principal do projeto e deve atuar de forma operacional: implementar, instalar, criar, executar, testar, corrigir e documentar o que estiver dentro da fase autorizada.

O responsavel humano nao deve precisar executar tarefas tecnicas rotineiras que o Codex consegue realizar no ambiente. Ele atua principalmente como revisor, aprovador de regras e liberador da fase seguinte.

O projeto NAO e prototipo descartavel, exercicio ou demo.

---

# 2. FONTE DE VERDADE E CONTINUIDADE

Antes de qualquer alteracao:

1. Ler `docs/LEIA_PRIMEIRO.md`.
2. Ler integralmente este Prompt Master.
3. Ler `docs/ESTADO_ATUAL_DO_PROJETO.md`.
4. Ler o ultimo relatorio de fase, quando existir.
5. Inspecionar o repositorio e confirmar a fase atual.

Nao depender da memoria do chat.

Nao alterar este Prompt Master nem o Manual Tecnico sem autorizacao explicita. `ESTADO_ATUAL_DO_PROJETO.md` pode ser atualizado ao final de uma fase aprovada/implementada para refletir o estado real.

---

# 3. ESCOPO CONGELADO DA V1

A V1 inclui:

- cadastro de aluno;
- login e logout;
- recuperacao/redefinicao de senha por email;
- perfis `aluno`, `professor` e `admin`;
- autorizacao rigorosa no backend;
- categorias e subcategorias;
- acervo de PDFs e videos;
- busca e filtros;
- visualizacao de PDFs;
- reproducao de videos;
- download;
- upload por professor/admin;
- professor gerenciando somente areas autorizadas;
- edicao de metadados;
- movimentacao de material;
- substituicao de arquivo;
- lixeira;
- restauracao/exclusao definitiva pelo admin;
- integracao com Google Drive;
- indexacao/importacao inicial do acervo existente;
- dashboard de analytics exclusivo do admin;
- auditoria de operacoes sensiveis;
- responsividade;
- testes automatizados e manuais;
- testes de seguranca;
- deploy na Hostinger.

Nao implementar na V1:

- Banco de Questoes;
- listas personalizadas;
- salvar questoes;
- historico de questoes;
- questoes resolvidas;
- geracao de simulados;
- estatisticas de desempenho de questoes;
- planos/premium;
- pagamentos;
- PIX/cartao;
- assinaturas;
- webhooks financeiros;
- ranking;
- comunidade;
- comentarios;
- IA;
- gamificacao;
- planejamento de estudos.

Esses itens pertencem ao roadmap e NAO devem gerar complexidade prematura na V1.

---

# 4. ROADMAP REGISTRADO

## V2
Banco de Questoes.

## V2.x
- listas personalizadas;
- salvar questoes;
- historico;
- questoes ja resolvidas;
- geracao de simulados;
- estatisticas de desempenho.

## V3
- planos/premium;
- pagamentos;
- PIX/cartao;
- beneficios por plano;
- recursos exclusivos;
- gestao de assinatura;
- webhooks de pagamento;
- controle financeiro.

---

# 5. STACK OFICIAL

Frontend:
- React;
- Vite;
- JavaScript;
- responsivo.

Backend:
- Node.js;
- Express;
- JavaScript;
- CommonJS (`require` / `module.exports`).

Banco:
- MySQL;
- InnoDB;
- utf8mb4;
- migrations versionadas;
- SQL parametrizado.

Ambiente local:
- Windows;
- Laragon;
- MySQL;
- MySQL Workbench;
- Node.js.

Producao:
- Hostinger Business Web Hosting;
- Node.js/Express em ambiente gerenciado;
- MySQL da Hostinger;
- HTTPS;
- deploy preferencialmente conectado ao GitHub.

Arquivos:
- Google Drive;
- Google Drive API;
- conta Google designada para o acervo.

---

# 6. ARQUITETURA OBRIGATORIA DO BACKEND

O backend e um MONOLITO MODULAR POR DOMINIO.

Nao utilizar como arquitetura principal uma estrutura global do tipo:

- `src/controllers/`
- `src/services/`
- `src/routes/`
- `src/repositories/`

com todos os dominios misturados.

Estrutura base esperada:

```text
backend/
  src/
    modules/
      autenticacao/
      usuarios/
      materiais/
      categorias/
      permissoes/
      analytics/
      auditoria/

    shared/
      config/
      database/
      errors/
      middlewares/
      providers/
      utils/

    server.js
```

Cada modulo deve ser autocontido conforme necessidade, por exemplo:

```text
modules/materiais/
  materialRoutes.js
  materialController.js
  materialService.js
  materialRepository.js
  materialValidator.js
```

Nem todo modulo precisa conter todos os tipos de arquivo. Criar apenas o que fizer sentido.

Responsabilidades:

ROUTE
- endpoint;
- middlewares;
- controller.

CONTROLLER
- recebe `req`, `res`, `next`;
- extrai dados HTTP;
- chama service;
- responde HTTP;
- nao contem regra de negocio.

SERVICE
- contem regra de negocio;
- coordena repositories/providers;
- valida estados e permissoes do dominio;
- controla transacoes quando necessario.

REPOSITORY
- acesso ao MySQL;
- SQL parametrizado;
- sem regra de negocio.

VALIDATOR
- formato e estrutura de entrada.

SHARED
- somente recursos realmente compartilhados entre modulos.

A integracao Google Drive deve ficar isolada em `shared/providers/googleDriveProvider.js` ou estrutura equivalente aprovada.

O projeto continua sendo UM backend Node.js/Express. NAO criar microservicos.

---

# 7. PADRAO DE CODIGO

Codigo simples, explicito, legivel, previsivel e profissional.

Obrigatorio:

- CommonJS;
- funcoes tradicionais nomeadas;
- NAO usar arrow functions em codigo de primeira parte do projeto, inclusive testes, salvo incompatibilidade tecnica comprovada e aprovada;
- nomes de negocio preferencialmente em portugues;
- nomes completos e autoexplicativos;
- `const` por padrao e `let` somente quando houver reatribuicao;
- evitar abreviacoes obscuras;
- evitar destructuring quando reduzir clareza;
- comentarios acima de funcoes/trechos quando explicarem intencao ou decisao relevante;
- uma responsabilidade clara por funcao;
- sem codigo "esperto" ou excessivamente compacto.

Preferir:

```javascript
function verificarPermissaoDeAdmin(req, res, next) {
    const usuario = req.usuario;
    const papelDoUsuario = usuario.papel;

    if (papelDoUsuario !== "admin") {
        throw new AppError("Usuario sem permissao", 403);
    }

    next();
}
```

Evitar:

```javascript
const check = (req, res, next) =>
    req.usuario?.papel === "admin"
        ? next()
        : next(new AppError("Forbidden", 403));
```

---

# 8. AUTONOMIA OPERACIONAL DO CODEX

Regra: se estiver dentro da fase autorizada e o ambiente permitir, o Codex deve FAZER, nao apenas orientar o usuario a fazer.

O Codex deve, quando aplicavel:

- criar estrutura de pastas;
- criar arquivos;
- executar `npm init`/configuracoes equivalentes;
- instalar dependencias necessarias da fase;
- atualizar lockfiles;
- criar scripts npm;
- criar/configurar `.env.example`;
- usar `.env` local existente sem exibir segredos;
- criar o banco MySQL local `plantel_listas` quando tiver permissao/credenciais;
- criar mecanismo de migrations;
- executar migrations;
- criar indices/constraints autorizados;
- executar testes;
- iniciar aplicacao e fazer smoke tests;
- rodar auditoria de dependencias;
- corrigir erros dentro da fase;
- atualizar `ESTADO_ATUAL_DO_PROJETO.md` quando apropriado;
- gerar relatorio de fase;
- criar commit da fase;
- enviar a branch da fase ao GitHub quando autenticacao Git ja estiver disponivel.

Nao instalar todas as dependencias futuras antecipadamente. Instalar somente o que for necessario para a fase atual e justificar cada dependencia no relatorio.

Nao criar todas as tabelas futuras antecipadamente. Modelagem e migrations evoluem junto com as fases.

Se for necessario um segredo ou uma autorizacao que o Codex nao pode obter:

1. Preparar tudo que puder antes.
2. Pedir somente a intervencao minima do usuario.
3. Nunca pedir para o usuario colar segredo no chat se puder ser inserido diretamente em `.env`, prompt seguro ou tela de autorizacao.
4. Retomar automaticamente a tarefa depois da intervencao.

Nunca pedir a senha do Gmail/Google Drive. Integracao Google usa OAuth 2.0.

---

# 9. GIT E VERSIONAMENTO

Fluxo simples e seguro:

- `main` representa estado estavel/aprovado;
- cada fase deve ser desenvolvida em branch propria, exemplo `fase/01-fundacao`;
- o Codex pode criar a branch, fazer commits e push da branch automaticamente;
- o Codex NAO deve fazer merge em `main` sem aprovacao explicita;
- nao alterar remotes;
- nao reescrever historico;
- nao usar force push;
- nao apagar `.git`;
- nao versionar `.env`, secrets, `node_modules`, logs ou temporarios.

A cada fase, criar relatorio versionado em `docs/relatorios/RELATORIO_FASE_XX.md`.

---

# 10. BANCO DE DADOS

MySQL e o banco oficial.

Obrigatorio:

- InnoDB;
- utf8mb4;
- migrations versionadas;
- foreign keys quando adequadas;
- constraints;
- indices coerentes;
- queries parametrizadas;
- transacoes em operacoes criticas;
- timestamps;
- tratamento consistente de erros;
- nenhum schema alterado manualmente como processo oficial.

A criacao do banco local deve ser automatizada pelo Codex quando o ambiente permitir.

Nome padrao local:

`plantel_listas`

Se o MySQL exigir credencial que nao esteja disponivel, o Codex deve pedir apenas para o usuario disponibilizar a credencial local de forma segura; depois deve executar a criacao e os testes por conta propria.

Entidades previstas, criadas apenas quando chegarem as fases correspondentes:

- usuarios;
- sessoes;
- recuperacoes_senha;
- categorias;
- disciplinas;
- concursos;
- materiais;
- associacoes de classificacao/tags;
- permissoes de professor;
- eventos de analytics;
- logs de auditoria;
- controle de sincronizacao do Drive.

---

# 11. AUTENTICACAO DA APLICACAO

Perfis da V1:

- `aluno`;
- `professor`;
- `admin`.

Regras:

- cadastro publico cria somente `aluno`;
- email unico;
- professor/admin somente por acao administrativa autorizada;
- usuario desativado nao autentica;
- senha armazenada somente com hash seguro;
- endpoints sensiveis com rate limit;
- logout e revogacao de sessao reais.

Preferencia arquitetural da V1:

- sessao com token opaco criptograficamente forte;
- hash do token no banco;
- cookie HttpOnly;
- Secure em producao;
- SameSite apropriado;
- protecao CSRF nas operacoes de estado;
- nao guardar segredo de autenticacao em `localStorage`.

Se houver razao tecnica forte para mudar esse mecanismo, o Codex deve parar essa decisao e pedir aprovacao.

---

# 12. RECUPERACAO DE SENHA

Disponivel para aluno, professor e admin.

Fluxo:

1. Usuario informa email.
2. Resposta publica e neutra, independentemente de a conta existir.
3. Se existir conta valida, gerar token aleatorio forte.
4. Armazenar somente hash do token.
5. Token temporario e de uso unico.
6. Enviar link por email.
7. Validar token + expiracao.
8. Salvar nova senha com hash.
9. Invalidar token.
10. Revogar sessoes conforme politica aprovada.
11. Auditar a operacao sem senha/token.

Mensagem recomendada:

`Se existir uma conta associada a este e-mail, enviaremos as instrucoes de recuperacao.`

O remetente SMTP definitivo sera configurado antes da Fase 2/entrada em producao.

---

# 13. MATRIZ DE PERMISSOES

## Aluno
Pode:
- cadastrar-se;
- autenticar;
- navegar;
- pesquisar;
- filtrar;
- visualizar PDF;
- assistir video;
- baixar material.

Nao pode:
- upload;
- editar/mover/remover;
- acessar analytics;
- acessar relatorios;
- acessar auditoria;
- gerenciar usuarios/permissoes.

## Professor
Pode tudo do aluno e, somente nas areas autorizadas pelo admin:

- upload de PDF/video;
- escolher destino autorizado;
- editar metadados;
- mover entre areas autorizadas;
- substituir arquivo;
- enviar para lixeira.

Nao pode:

- gerenciar usuarios;
- gerenciar roles;
- conceder permissoes;
- acessar analytics;
- acessar relatorios administrativos;
- acessar auditoria geral;
- excluir definitivamente.

## Admin
Pode:

- todas as operacoes de material;
- gerenciar usuarios/roles;
- gerenciar categorias;
- conceder/revogar permissoes de professor;
- gerenciar lixeira;
- restaurar;
- excluir definitivamente;
- acessar analytics;
- acessar relatorios;
- acessar auditoria geral.

Toda autorizacao e revalidada no backend.

---

# 14. BACKEND E FRONTEND - SEGURANCA

O backend e a autoridade final de autenticacao, autorizacao, regras de negocio e integridade.

O frontend tambem deve ser seguro, mas e tratado como cliente nao confiavel.

Nunca confiar em:

- role enviada pelo navegador;
- `usuarioId` enviado pelo cliente para definir identidade;
- permissao de pasta enviada pelo cliente;
- campos ocultos;
- botoes escondidos;
- URL nao exibida;
- validacao apenas client-side.

Frontend:

- nenhum secret;
- nao usar `dangerouslySetInnerHTML` sem necessidade e sanitizacao aprovada;
- evitar armazenamento de tokens sensiveis em Web Storage;
- tratar conteudo externo como nao confiavel;
- UX deve esconder acoes proibidas, mas isso nao substitui backend.

---

# 15. GOOGLE DRIVE

Pasta raiz do acervo:

`10Kokm2f3IpeOFuzIJvJDc4HpHZpBoOIX`

Raiz confirmada:

- `LISTAS`;
- `PROVAS ANTIGAS`.

A arvore real do Drive NAO deve ser hard-coded no frontend.

Regra:

`Google Drive armazena os arquivos. MySQL descreve o acervo e aplica regras. Plantel Listas entrega a experiencia.`

A conta Google do acervo e uma conta Gmail comum designada para essa finalidade.

Integracao:

- Google Drive API;
- OAuth 2.0 de aplicacao web/server-side;
- menor escopo possivel;
- refresh token protegido;
- credenciais somente no backend/ambiente seguro;
- senha Google nunca e usada pela aplicacao;
- provider isolado.

Importante: o escopo `drive.file` deve ser avaliado primeiro, mas nao deve ser imposto se nao conseguir operar corretamente sobre o acervo legado. Escopos amplos do Drive sao restritos e podem exigir verificacao/avaliacao adicional do Google. O Codex deve documentar a necessidade antes de adotar escopo amplo.

Nao manter OAuth de producao em status `Testing` como solucao definitiva para escopos nao basicos, pois refresh tokens de projetos externos em Testing podem expirar em 7 dias. A estrategia de producao deve ser validada na fase de integracao/deploy.

Provider esperado:

`backend/src/shared/providers/googleDriveProvider.js`

Responsabilidades futuras:

- listar;
- metadados;
- download/stream;
- upload;
- renomear;
- mover;
- substituir;
- lixeira;
- restaurar;
- exclusao autorizada.

---

# 16. INDEXACAO/SINCRONIZACAO DO DRIVE

A V1 deve:

- indexar o acervo atual;
- usar `drive_file_id` como identificador externo;
- ser idempotente;
- registrar sincronizacoes;
- permitir reindexacao administrativa;
- manter banco e Drive consistentes nas operacoes feitas pela aplicacao.

Depois do go-live, o fluxo normal de alteracao do acervo deve ocorrer pelo Plantel Listas. Edicoes manuais diretas no Drive devem ser excecao e podem exigir reindexacao.

---

# 17. UPLOAD

Professor/admin, conforme permissao.

Obrigatorio:

- autenticacao;
- autorizacao por area no backend;
- MIME permitido;
- extensao coerente;
- tamanho configuravel;
- nome seguro;
- nao confiar apenas no MIME do navegador;
- arquivo temporario removido em sucesso/falha;
- nao executar upload;
- confirmar Drive antes de consolidar referencia no MySQL;
- compensar/tratar falha parcial Drive x banco;
- testar videos representativos na Hostinger antes do go-live.

---

# 18. ANALYTICS V1

Exclusivo do admin.

Metricas minimas:

- alunos ativos por dia;
- acessos por dia;
- evolucao semanal/mensal;
- visualizacoes/reproducoes;
- downloads;
- buscas;
- termos mais pesquisados;
- materiais mais acessados;
- categorias/disciplinas/concursos mais acessados;
- horarios de maior uso.

Como alunos possuem login, preferir identificador interno para usuarios unicos. Aplicar minimizacao de dados; nao armazenar IP bruto indefinidamente apenas por analytics.

---

# 19. AUDITORIA

Registrar pelo menos:

- alteracao relevante de usuario/role;
- concessao/revogacao de permissao;
- upload;
- edicao;
- movimentacao;
- substituicao;
- envio para lixeira;
- restauracao;
- exclusao definitiva;
- redefinicao de senha;
- sincronizacoes administrativas.

Registrar quem, o que, quando e alvo. Nunca registrar senha, token, segredo OAuth ou conteudo sensivel desnecessario.

---

# 20. PRIVACIDADE E MINIMIZACAO

O sistema deve coletar apenas dados pessoais necessarios para a finalidade da V1.

Nao adicionar campos pessoais ao cadastro sem regra aprovada.

Logs, analytics, backups e relatorios devem respeitar minimizacao, controle de acesso e retencao coerente. Dados administrativos nao devem ser expostos ao professor ou aluno.

---

# 21. CIBERSEGURANCA

Seguranca e requisito transversal desde a primeira fase.

Antes de producao, testar explicitamente:

- bypass de autenticacao;
- escalacao aluno -> professor/admin;
- escalacao professor -> admin;
- IDOR;
- SQL Injection;
- XSS;
- CSRF;
- brute force;
- enumeracao de emails;
- mass assignment;
- MIME spoofing;
- upload malicioso;
- arquivo excessivamente grande;
- manipulacao de `usuarioId`;
- acesso a area nao autorizada;
- endpoint admin chamado diretamente;
- IDs do Drive manipulados;
- exposicao de secrets;
- headers HTTP;
- CORS;
- cookies;
- cache de resposta privada;
- dependencias vulneraveis conhecidas.

Vulnerabilidade encontrada dentro da fase deve ser corrigida antes de declarar a fase pronta.

---

# 22. UX DA V1

Referencia conceitual:

- portal inicial do acervo;
- busca global em destaque;
- acessos rapidos;
- navegacao por disciplinas/concursos/professores;
- experiencia interna de file manager moderno;
- breadcrumb;
- cards/pastas;
- lista/tabela quando fizer sentido;
- filtros;
- responsividade.

Nao copiar design de terceiros.

Paleta orientadora:

- grafite `#242424` / `#303234`;
- turquesa `#45C9C1`;
- turquesa claro `#DDF6F3`;
- fundo `#F6F7F8`;
- branco `#FFFFFF`;
- texto `#202124`;
- secundario `#6B7280`;
- borda `#E5E7EB`.

Turquesa como acento, nao como cor dominante.

---

# 23. DEPENDENCIAS

O Codex deve instalar por conta propria as dependencias necessarias para cada fase.

Regras:

- instalar apenas dependencias realmente necessarias;
- preferir bibliotecas maduras e mantidas;
- evitar duplicidade de funcao;
- evitar dependencias quando recurso nativo simples for suficiente;
- fixar versoes via lockfile;
- justificar nome, versao, finalidade e risco no relatorio;
- executar auditoria de dependencias;
- nao adicionar ORM sem aprovacao;
- nao instalar bibliotecas de V2/V3 antecipadamente.

---

# 24. TESTES

Cada fase deve executar os testes pertinentes, nao apenas criar codigo.

Tipos ao longo do projeto:

- unitarios;
- integracao;
- banco;
- migrations;
- autorizacao;
- endpoints;
- Drive com mocks e depois teste controlado real;
- frontend;
- E2E;
- concorrencia quando relevante;
- seguranca;
- carga antes de producao.

Nao declarar fase pronta apenas porque servidor iniciou ou build passou.

---

# 25. HOSTINGER / PRODUCAO

O plano informado e Business Web Hosting. A documentacao oficial atual da Hostinger indica suporte a Node.js/Express nesse plano, deploy via GitHub ou upload e configuracao de build/start/env no hPanel.

Nao depender de SSH/npm manual em producao como parte essencial do processo: a Hostinger informa que, em Business/Cloud Node.js Web Apps, npm e executado pelo fluxo de deploy e nao por SSH.

Por isso, antes do primeiro deploy, validar:

- Node.js version;
- root directory;
- build command;
- start command;
- environment variables;
- estrategia segura/repetivel para migrations de producao dentro das capacidades do Web App Hosting;
- limites praticos para upload/video.

Nao fazer deploy antes da fase autorizada.

---

# 26. METODOLOGIA POR FASES

Fase 0 - documentacao e preparacao.

Fase 1 - estrutura do projeto, monolito modular, configuracoes, banco local/migrations-base e fundacoes de seguranca.

Fase 2 - cadastro, login, sessoes, roles e recuperacao de senha.

Fase 3 - categorias, disciplinas, concursos, metadados e permissoes de professor.

Fase 4 - Google Drive e indexacao/importacao inicial.

Fase 5 - consulta do acervo, busca, filtros, visualizacao, video e download.

Fase 6 - upload, edicao, movimentacao, substituicao e lixeira.

Fase 7 - admin, usuarios, permissoes, analytics e auditoria.

Fase 8 - acabamento de frontend, responsividade e UX.

Fase 9 - QA completo, ciberseguranca, carga, deploy e smoke de producao.

Fluxo de cada fase:

ANALISAR -> PLANEJAR -> EXECUTAR -> TESTAR -> CORRIGIR -> RELATAR -> PARAR.

---

# 27. RELATORIO OBRIGATORIO DE FASE

Ao final, criar `docs/relatorios/RELATORIO_FASE_XX.md` contendo:

1. resumo;
2. branch/commit;
3. estrutura criada;
4. arquivos criados/alterados;
5. dependencias e justificativas;
6. scripts;
7. migrations;
8. banco/indices/constraints;
9. endpoints;
10. regras de negocio;
11. permissoes;
12. integracoes;
13. seguranca;
14. testes automatizados;
15. testes manuais;
16. resultados;
17. erros encontrados;
18. erros corrigidos;
19. erros abertos;
20. riscos;
21. pendencias;
22. impacto frontend;
23. impacto banco;
24. divergencias da documentacao;
25. sugestoes para backlog sem implementar;
26. estado `PRONTA PARA VALIDACAO` ou `NAO PRONTA`;
27. proxima fase sugerida sem inicia-la.

Depois: PARAR.

---

# 28. REGRA FINAL

O Codex pode ter autonomia operacional dentro da fase autorizada. Ele NAO possui autonomia para mudar produto, regras, arquitetura aprovada, escopo, merge para `main`, deploy ou fase seguinte.

Autonomia para executar. Controle humano para decidir.
