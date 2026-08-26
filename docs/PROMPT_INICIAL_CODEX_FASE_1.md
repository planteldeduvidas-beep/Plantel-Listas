# PROMPT INICIAL PARA O CODEX - FASE 1

Vamos iniciar oficialmente o desenvolvimento do PLANTEL LISTAS.

Este e um sistema real de producao. Voce sera o PROGRAMADOR PRINCIPAL. Eu atuarei principalmente como revisor/validador.

## 1. Antes de tocar no codigo

Leia integralmente:

- `docs/LEIA_PRIMEIRO.md`
- `docs/PLANTEL_LISTAS_PROMPT_MASTER_CODEX.md`
- `docs/ESTADO_ATUAL_DO_PROJETO.md`
- `docs/Manual_Tecnico_Plantel_Listas_V1.pdf`

Considere os documentos como fonte oficial de verdade.

Depois inspecione:

- repositorio;
- branch atual;
- arquivos existentes;
- package.json/package-lock existentes;
- configuracoes;
- migrations;
- git status.

Antes de implementar, responda com um plano curto contendo:

1. o que voce entendeu do projeto;
2. o que a Fase 1 inclui;
3. estrutura que pretende criar;
4. dependencias que pretende instalar e por que;
5. como pretende criar/testar o MySQL local;
6. qualquer conflito entre documentacao e repositorio.

Se nao houver conflito bloqueante, NAO espere que eu execute tarefas tecnicas rotineiras. Prossiga e execute a fase.

## 2. Autonomia operacional

Dentro da Fase 1, faca diretamente tudo que seu ambiente permitir.

Voce deve, quando necessario:

- criar a branch `fase/01-fundacao`;
- criar pastas/arquivos;
- inicializar/configurar packages;
- instalar as dependencias necessarias da Fase 1;
- atualizar lockfiles;
- criar `.env.example` sem segredos;
- usar configuracao local segura para `.env`;
- criar o banco MySQL local `plantel_listas` se tiver acesso/credenciais;
- criar infraestrutura de migrations;
- executar migrations;
- configurar e iniciar Express;
- criar a base React/Vite se fizer parte da fundacao definida;
- executar testes;
- executar smoke tests;
- testar banco e migrations;
- rodar auditoria de dependencias;
- corrigir erros encontrados dentro da fase;
- criar/atualizar README de desenvolvimento;
- criar commit da Fase 1;
- fazer push da branch da fase se a autenticacao GitHub ja estiver funcional;
- gerar o relatorio final.

NAO apenas escreva instrucoes para eu fazer essas tarefas se voce consegue executa-las.

Se precisar de uma senha/segredo local que nao existe no ambiente, pare somente o ponto dependente e me diga exatamente o que precisa ser disponibilizado, sem pedir que eu exponha segredos no chat. Depois continue a execucao.

## 3. Arquitetura obrigatoria

Backend = MONOLITO MODULAR POR DOMINIO.

Estrutura conceitual:

```text
backend/src/
  modules/
  shared/
  server.js
```

Dominios futuros previstos:

- autenticacao;
- usuarios;
- materiais;
- categorias;
- permissoes;
- analytics;
- auditoria.

Recursos compartilhados previstos:

- config;
- database;
- errors;
- middlewares;
- providers;
- utils.

NAO crie uma arquitetura global misturando todos os controllers/services/routes dos dominios.

NAO crie microservicos.

## 4. Padrao de codigo

- Node.js + Express;
- JavaScript;
- CommonJS;
- `require` / `module.exports`;
- funcoes tradicionais nomeadas;
- NAO usar arrow functions em codigo de primeira parte;
- nomes claros e preferencialmente em portugues;
- sem abreviacoes obscuras;
- codigo simples e legivel;
- controller sem regra de negocio;
- service com regra de negocio;
- repository para MySQL;
- provider para integracoes externas.

## 5. Fase autorizada

Implemente SOMENTE:

FASE 1 - estrutura do projeto, monolito modular, configuracoes, banco local/migrations-base e fundacoes de seguranca.

Objetivos:

- estrutura profissional do repositorio;
- backend modular por dominio preparado;
- frontend base preparado;
- Express configurado;
- configuracao por ambiente;
- `.env.example`;
- conexao MySQL segura;
- banco local `plantel_listas` criado se possivel;
- migrations versionadas e executaveis;
- tratamento global de erros / `AppError` equivalente;
- 404 padronizado;
- headers de seguranca;
- politica CORS coerente com o ambiente;
- logs sem dados sensiveis;
- base de testes;
- scripts npm;
- `.gitignore`;
- README;
- verificacao de compatibilidade arquitetural com Hostinger.

Crie apenas tabelas/migrations realmente necessarias para a fundacao. NAO antecipe toda a modelagem das fases futuras.

## 6. Nesta fase NAO implemente

- cadastro;
- login/logout;
- recuperacao de senha;
- sessoes;
- roles funcionais;
- permissoes funcionais;
- Google Drive API;
- OAuth Google;
- materiais;
- upload;
- categorias funcionais;
- busca/filtros;
- analytics funcional;
- auditoria funcional;
- telas finais;
- qualquer recurso V2/V3.

## 7. Banco

MySQL oficial.

Obrigatorio:

- InnoDB;
- utf8mb4;
- migrations;
- SQL parametrizado quando houver queries;
- configuracao por env;
- tratamento de erro;
- nenhuma alteracao manual no Workbench como processo oficial.

Se puder acessar o MySQL local, crie e teste o banco voce mesmo. Se o MySQL nao estiver acessivel, diagnostique primeiro; so solicite minha intervencao quando realmente necessaria.

## 8. Seguranca da Fase 1

Revise e implemente o que couber nesta fundacao para:

- secrets;
- stack trace em producao;
- headers HTTP;
- CORS;
- logs;
- configuracao de producao/desenvolvimento;
- validacao de env obrigatoria;
- preparacao para rate limit;
- preparacao para CSRF/sessoes futuras;
- dependencias vulneraveis.

O backend sera o dono da verdade nas fases seguintes.

## 9. Git

- nao altere remote;
- nao apague `.git`;
- nao force push;
- nao reescreva historico;
- trabalhe na branch `fase/01-fundacao`;
- ao final, se a fase estiver consistente, crie commit profissional e faca push da branch se as credenciais permitirem;
- NAO faca merge em `main`.

## 10. Testes obrigatorios antes de encerrar

Execute o que for aplicavel:

- backend inicia;
- frontend base inicia/builda;
- conexao MySQL;
- criacao/uso do banco local;
- migrations sobem corretamente;
- migrations repetidas nao corrompem estado;
- erro de banco e tratado;
- env obrigatoria ausente falha de forma controlada;
- 404;
- erro inesperado;
- stack trace nao vaza em producao;
- testes automatizados;
- auditoria de dependencias;
- `git status` final.

Corrija os problemas dentro da Fase 1 antes de declarar pronto.

## 11. Relatorio e parada obrigatoria

Crie:

`docs/relatorios/RELATORIO_FASE_01.md`

Inclua:

- resumo;
- branch/commit;
- estrutura criada;
- arquivos criados/alterados;
- dependencias, versoes e justificativas;
- scripts;
- variaveis de ambiente esperadas sem valores secretos;
- banco/migrations;
- configuracoes;
- medidas de seguranca;
- testes e resultados;
- erros encontrados/corrigidos/abertos;
- riscos;
- pendencias;
- divergencias da documentacao;
- sugestoes para backlog sem implementar;
- estado final `PRONTA PARA VALIDACAO` ou `NAO PRONTA`;
- proxima fase sugerida sem inicia-la.

Atualize `docs/ESTADO_ATUAL_DO_PROJETO.md` somente para refletir fatos realmente implementados na Fase 1.

Depois do relatorio: PARE.

NAO inicie Fase 2.
NAO faca merge em `main`.
NAO faca deploy.
NAO configure Google Drive.
Aguarde minha validacao explicita.
