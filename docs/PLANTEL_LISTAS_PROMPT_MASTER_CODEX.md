# PLANTEL LISTAS - PROMPT MASTER DO CODEX
Versao: 1.0
Data-base: 26/08/2026
Status: V1 funcionalmente congelada

## 1. Regra de entrada obrigatoria

Antes de alterar qualquer arquivo:

1. Leia integralmente todos os arquivos da pasta `/docs`.
2. Leia especialmente:
   - `PLANTEL_LISTAS_PROMPT_MASTER_CODEX.md`
   - `REGRAS_DE_NEGOCIO_V1.md`
   - `ARQUITETURA.md`
   - `MATRIZ_DE_PERMISSOES.md`
   - `ESTADO_ATUAL_DO_PROJETO.md`
3. Analise a estrutura existente do repositorio e o estado das migrations.
4. Informe, em poucas linhas, sua compreensao da fase atual e o plano da fase.
5. Nao implemente funcionalidade fora da fase autorizada.
6. Ao terminar a fase, execute testes, gere o relatorio obrigatorio e PARE. Nao avance para a fase seguinte sem autorizacao explicita.

O projeto e real e sera usado em producao. Trate seguranca, integridade, manutencao e legibilidade como requisitos obrigatorios.

---

## 2. Papel do Codex

O Codex e o programador principal.

Ele pode:
- analisar o codigo;
- propor solucoes;
- implementar a fase autorizada;
- criar migrations;
- escrever testes;
- corrigir bugs encontrados dentro da fase;
- registrar sugestoes tecnicas no relatorio.

Ele nao pode, sem aprovacao explicita:
- mudar regra de negocio;
- mudar o escopo congelado da V1;
- trocar banco;
- trocar arquitetura;
- trocar Google Drive por outro storage;
- adicionar ORM;
- adicionar Docker;
- criar novas roles;
- criar recursos de V2/V3;
- mudar o fluxo de autorizacao;
- introduzir bibliotecas apenas por preferencia pessoal;
- fazer refatoracao ampla fora da fase;
- continuar para a proxima fase automaticamente.

Melhorias nao autorizadas devem ser registradas em `Sugestoes / Backlog`, nao implementadas.

---

## 3. Stack oficial

### Frontend
- React
- Vite
- JavaScript
- Interface responsiva

### Backend
- Node.js
- Express
- CommonJS
- `require(...)`
- `module.exports = ...`

### Banco
- MySQL
- InnoDB
- utf8mb4
- migrations versionadas
- SQL parametrizado

### Desenvolvimento local
- Laragon
- MySQL local
- MySQL Workbench
- Node.js

### Producao
- Hostinger Business Web Hosting
- Node.js / Express
- MySQL gerenciado da Hostinger
- HTTPS
- variaveis de ambiente configuradas no ambiente de producao

### Arquivos
- Google Drive
- pasta raiz oficial do Plantel Listas
- integracao via Google Drive API
- credenciais Google nunca no frontend

---

## 4. Padrao obrigatorio de codigo

### 4.1 Estilo

Usar codigo simples, explicito, legivel e previsivel.

Obrigatorio:
- nomes de variaveis e funcoes em portugues quando forem codigo de negocio;
- nomes completos e autoexplicativos;
- funcoes tradicionais nomeadas;
- fluxo de controle facil de ler;
- `const` por padrao e `let` apenas quando houver reatribuicao;
- comentarios somente quando explicarem intencao, regra ou decisao importante;
- separar responsabilidades.

Nao usar arrow functions no codigo de negocio do projeto.

Preferir:

```javascript
function buscarUsuarioPorEmail(email) {
    // ...
}

module.exports = buscarUsuarioPorEmail;
```

Evitar:

```javascript
const buscar = async (e) => {
    // ...
};
```

Nao usar atalhos que reduzam legibilidade sem ganho real.

### 4.2 Nomes

Preferir:
- `usuarioId`
- `materialId`
- `categoriaId`
- `email`
- `senha`
- `senhaHash`
- `comandoSql`
- `valoresDoComando`
- `resultadoDoBanco`
- `dadosDoUsuario`
- `permissaoDoProfessor`
- `arquivoDoDrive`
- `eventoDeAcesso`

Evitar:
- `u`
- `usr`
- `mat`
- `resDb`
- `x`
- `tmp`
- siglas obscuras

### 4.3 Camadas

Routes:
- definem endpoint;
- aplicam middlewares;
- chamam controller.

Controller:
- recebe `req`, `res`, `next`;
- extrai dados da requisicao;
- chama service;
- responde HTTP;
- nao contem regra de negocio.

Service:
- contem regras de negocio;
- valida estados;
- verifica regras especificas do dominio;
- coordena repositories/providers;
- abre transacao quando necessario.

Repository/Model:
- acessa MySQL;
- usa SQL parametrizado;
- nao decide regra de negocio.

Middleware:
- autenticacao;
- autorizacao;
- rate limit;
- CSRF;
- validacoes transversais.

Provider:
- integracoes externas;
- Google Drive deve ficar isolado em provider proprio, por exemplo:
  `googleDriveProvider.js`.

Validator:
- valida formato dos dados de entrada;
- nao substitui regra de negocio do service.

---

## 5. Regra absoluta de seguranca

O backend e a autoridade final.

O frontend pode ocultar botoes, bloquear navegacao e melhorar UX, mas:
- nenhuma permissao depende do frontend;
- nenhuma role enviada pelo cliente e confiavel;
- nenhum `usuarioId` enviado pelo cliente define identidade autenticada;
- nenhuma pasta enviada pelo cliente define permissao do professor;
- nenhuma operacao critica e executada sem nova validacao no backend.

Qualquer rota sensivel deve recusar acesso indevido mesmo que seja chamada manualmente fora da interface.

---

## 6. Autenticacao da aplicacao

Perfis:
- `aluno`
- `professor`
- `admin`

Regras:
- cadastro publico cria exclusivamente `aluno`;
- professor e admin nunca podem ser criados por cadastro publico;
- somente admin pode promover, rebaixar, ativar ou desativar perfis administrativos;
- email deve ser unico;
- senha nunca e armazenada em texto puro;
- senha deve ser armazenada com hash seguro;
- sessoes/tokens nao podem ficar acessiveis ao JavaScript do navegador quando tecnicamente evitavel;
- logout deve invalidar a sessao;
- troca de senha deve permitir invalidar sessoes existentes;
- endpoints de login, cadastro e recuperacao devem possuir rate limit.

Preferencia arquitetural para a V1:
- sessao autenticada com token opaco forte;
- cookie `HttpOnly`, `Secure` em producao e `SameSite`;
- hash do token armazenado no banco;
- protecao CSRF nas requisicoes de alteracao de estado;
- nao armazenar token de autenticacao em `localStorage`.

Se durante a implementacao for identificada uma razao tecnica forte para outro mecanismo, PARE e solicite aprovacao antes de mudar.

---

## 7. Recuperacao de senha

Fluxo obrigatorio:

1. Usuario informa email.
2. Backend responde de forma neutra, existindo ou nao a conta.
3. Se existir conta ativa:
   - gera token aleatorio forte;
   - armazena somente hash do token;
   - define expiracao curta;
   - envia link por email.
4. Usuario abre o link e informa nova senha.
5. Backend valida token, expiracao e uso anterior.
6. Atualiza a senha.
7. Invalida o token de recuperacao.
8. Revoga sessoes anteriores conforme implementacao aprovada.
9. Registra evento de auditoria sem registrar senha ou token.

Mensagem publica recomendada:
`Se existir uma conta associada a este e-mail, enviaremos as instrucoes de recuperacao.`

---

## 8. Google Drive

O Google Drive guarda os arquivos fisicos.
O MySQL guarda metadados, usuarios, permissoes, classificacoes, auditoria e analytics.

Regra:
`Drive armazena. Banco descreve. Plantel Listas entrega a experiencia.`

Pasta raiz atual:
- ID: `10Kokm2f3IpeOFuzIJvJDc4HpHZpBoOIX`

Nunca:
- armazenar senha da conta Google;
- colocar client secret, refresh token ou chave no frontend;
- espalhar chamadas da API Google por controllers/services.

O acesso Google deve ser isolado em provider.

Metodos esperados, conforme necessidade da fase:
- listar arquivos/pastas;
- obter metadados;
- baixar/streamar;
- upload;
- mover;
- renomear;
- substituir arquivo;
- enviar para lixeira;
- restaurar quando autorizado;
- excluir definitivamente quando autorizado.

OAuth:
- usar OAuth 2.0 da conta Google designada para o acervo;
- solicitar somente os escopos necessarios;
- `drive.file` deve ser avaliado primeiro;
- se o acervo legado e as operacoes exigirem escopo mais amplo, documentar a necessidade e pedir aprovacao antes de usar escopo `drive` amplo;
- refresh token deve ser protegido como segredo de producao.

A integracao Google da conta do acervo e independente do login de aluno/professor/admin.

---

## 9. Upload

Professor e admin podem enviar PDFs e videos conforme permissao.

Obrigatorio:
- usuario autenticado;
- autorizacao por pasta/categoria validada pelo backend;
- MIME permitido;
- extensao coerente;
- tamanho configuravel;
- nome seguro;
- tratamento de falha parcial;
- nao confiar no MIME enviado pelo navegador;
- nao executar arquivo enviado;
- nao guardar arquivo temporario alem do necessario;
- limpar temporarios apos sucesso ou falha;
- salvar `drive_file_id` somente depois de confirmar a operacao no Drive;
- usar transacao/compensacao quando banco e Drive precisarem permanecer consistentes.

O limite final de upload deve ser validado com arquivos reais no ambiente Hostinger antes do go-live, principalmente para videos.

---

## 10. Autorizacao

Sempre validar no backend.

Aluno:
- consultar;
- pesquisar;
- filtrar;
- visualizar;
- assistir;
- baixar.

Professor:
- tudo que aluno pode;
- fazer upload nas areas autorizadas;
- editar metadados nas areas autorizadas;
- mover entre areas autorizadas;
- substituir arquivo;
- enviar material para lixeira;
- nao gerenciar usuarios;
- nao gerenciar permissoes;
- nao acessar analytics;
- nao acessar relatorios administrativos;
- nao acessar auditoria geral;
- nao excluir definitivamente.

Admin:
- acesso completo operacional;
- gerenciar usuarios e roles;
- gerenciar categorias;
- gerenciar permissoes de professores;
- gerenciar lixeira;
- restaurar;
- exclusao definitiva;
- analytics;
- relatorios;
- auditoria geral.

Professor nunca ganha acesso porque o frontend exibiu um botao. A permissao deve ser consultada e validada no backend.

---

## 11. Analytics V1

Somente admin acessa o dashboard.

Metricas minimas:
- alunos ativos por dia;
- acessos por dia;
- evolucao semanal e mensal;
- downloads;
- visualizacoes/reproducoes;
- buscas;
- termos mais pesquisados;
- materiais mais acessados;
- categorias/disciplinas/concursos mais acessados;
- horarios de maior uso.

Como alunos terao login, preferir contagem por `usuario_id`, sem rastreamento invasivo.

Nao armazenar dados pessoais desnecessarios.
Nao expor analytics de um aluno individual ao professor.
Nao armazenar IP bruto indefinidamente apenas para analytics.

---

## 12. Banco de dados

Obrigatorio:
- InnoDB;
- utf8mb4;
- foreign keys;
- indices coerentes;
- constraints;
- timestamps;
- migrations;
- transacoes em operacoes criticas;
- queries parametrizadas;
- nenhum dado de autorizacao confiado ao frontend.

Entidades esperadas:
- usuarios;
- sessoes;
- recuperacoes_senha;
- categorias;
- materiais;
- disciplinas;
- concursos;
- tags;
- associacoes de materiais;
- permissoes de professor por area;
- eventos de analytics;
- logs de auditoria;
- controle de sincronizacao do Drive.

A modelagem exata deve ser proposta na fase de banco e validada antes de uma migration ampla.

---

## 13. Lixeira e exclusao

Professor:
- pode enviar material para lixeira apenas em area autorizada.

Admin:
- administra lixeira;
- pode restaurar;
- pode excluir definitivamente.

Exclusao definitiva deve:
- exigir autorizacao de admin no backend;
- ser auditada;
- tratar Drive + banco de forma consistente;
- evitar perda silenciosa em falha parcial.

---

## 14. Auditoria

Registrar ao menos:
- login administrativo relevante;
- criacao/alteracao/desativacao de usuario;
- alteracao de role;
- concessao/revogacao de permissao;
- upload;
- alteracao de material;
- movimentacao;
- substituicao;
- envio para lixeira;
- restauracao;
- exclusao definitiva;
- redefinicao de senha;
- sincronizacoes administrativas do Drive.

Log de auditoria deve registrar quem, o que, quando e o alvo.
Nunca registrar senha, token, segredo OAuth ou conteudo sensivel desnecessario.

---

## 15. Ciberseguranca

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
- upload malicioso;
- MIME spoofing;
- arquivo excessivamente grande;
- mass assignment;
- alteracao de `usuarioId` no corpo;
- acesso a pasta nao autorizada;
- acesso direto a relatorios;
- acesso direto a IDs do Drive;
- manipulacao de parametros;
- secrets em codigo/log;
- dependencias vulneraveis conhecidas;
- cabecalhos HTTP de seguranca;
- CORS;
- cookies;
- cache de respostas privadas.

O Codex deve corrigir vulnerabilidades encontradas dentro da fase antes de declarar a fase pronta.

---

## 16. UX da V1

Referencia conceitual, nao copia visual:
- landing/portal do acervo;
- busca global em destaque;
- acessos rapidos;
- navegacao por disciplinas/concursos/professores;
- depois, experiencia de file manager moderno;
- breadcrumb;
- cards/pastas;
- tabela/lista de materiais quando fizer sentido;
- filtros;
- responsividade.

Paleta orientadora:
- grafite `#242424` / `#303234`;
- turquesa `#45C9C1`;
- turquesa claro `#DDF6F3`;
- fundo `#F6F7F8`;
- branco `#FFFFFF`;
- texto `#202124`;
- texto secundario `#6B7280`;
- bordas `#E5E7EB`.

O turquesa e acento, nao deve dominar toda a interface.

---

## 17. Escopo congelado da V1

Inclui:
- cadastro e login de aluno;
- login professor/admin;
- recuperacao de senha;
- roles e autorizacao;
- acervo PDF/video;
- categorias e subcategorias;
- busca e filtros;
- visualizacao/reproducao;
- download;
- upload professor/admin;
- edicao de metadados;
- movimentacao;
- substituicao;
- lixeira;
- integracao Google Drive;
- importacao/indexacao inicial do acervo;
- permissao de professor por area;
- analytics admin;
- auditoria;
- responsividade;
- testes;
- deploy Hostinger.

Nao inclui:
- banco de questoes;
- favoritos;
- listas personalizadas;
- historico de questoes;
- geracao de simulados;
- estatisticas de desempenho de questoes;
- ranking;
- comunidade;
- comentarios;
- IA;
- pagamentos;
- assinatura;
- premium;
- PIX/cartao;
- gamificacao;
- planejamento de estudos.

---

## 18. Roadmap que NAO deve ser implementado agora

### V2
Banco de Questoes.

### V2.x
- listas personalizadas;
- salvar questoes;
- historico;
- questoes resolvidas;
- geracao de simulados;
- estatisticas de desempenho.

### V3
- planos/premium;
- pagamentos;
- PIX/cartao;
- beneficios por plano;
- recursos exclusivos;
- gestao de assinatura;
- webhooks de pagamento;
- controle financeiro.

A arquitetura da V1 nao deve sabotar essas evolucoes, mas nao deve antecipar complexidade desnecessaria para elas.

---

## 19. Metodologia por fases

Fase 0 - documentacao e preparacao.
Fase 1 - estrutura do projeto, configuracoes, banco-base e fundacoes de seguranca.
Fase 2 - cadastro, login, sessoes, roles e recuperacao de senha.
Fase 3 - categorias, disciplinas, concursos, metadados e permissoes de professor.
Fase 4 - integracao Google Drive e importacao/indexacao inicial.
Fase 5 - consulta do acervo, busca, filtros, visualizacao, video e download.
Fase 6 - upload, edicao, movimentacao, substituicao e lixeira.
Fase 7 - painel administrativo, usuarios, permissoes, analytics e auditoria.
Fase 8 - acabamento de frontend, responsividade e UX.
Fase 9 - QA completo, seguranca, carga, deploy e smoke de producao.

Cada fase:
ANALISAR -> PLANEJAR -> IMPLEMENTAR -> TESTAR -> RELATAR -> PARAR.

---

## 20. Relatorio obrigatorio ao final de cada fase

O relatorio deve conter:

1. Resumo da fase.
2. Arquivos criados.
3. Arquivos alterados.
4. Migrations criadas/aplicadas.
5. Tabelas/indices/constraints afetados.
6. Endpoints criados/alterados.
7. Regras de negocio implementadas.
8. Permissoes implementadas.
9. Integracoes externas afetadas.
10. Testes automatizados executados.
11. Testes manuais executados.
12. Testes de autorizacao.
13. Testes de ciberseguranca.
14. Erros encontrados.
15. Erros corrigidos.
16. Erros ainda abertos.
17. Riscos identificados.
18. Impacto no frontend.
19. Impacto no banco.
20. Divergencias em relacao aos documentos.
21. Sugestoes para backlog.
22. Estado final: `PRONTA PARA VALIDACAO` ou `NAO PRONTA`.
23. Proxima fase sugerida, sem inicia-la.

Depois do relatorio, PARE.
