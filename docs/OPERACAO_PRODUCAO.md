# OPERACAO DE PRODUCAO - PLANTEL LISTAS

Este guia prepara a operacao, mas nao autoriza deploy. Valores reais devem existir apenas nas variaveis protegidas do ambiente.

## 1. Antes de publicar

1. Confirmar o commit aprovado e registrar um backup MySQL restauravel.
2. Configurar `listas.planteldeduvidas.com.br` sem substituir a Home de `planteldeduvidas.com.br`.
3. Confirmar no plano Hostinger: Node.js 22 ou superior, MySQL, limite de upload maior que o maior `UPLOAD_MAX_*`, timeout do proxy e logs persistentes.
4. Preencher as variaveis de `.env.example`, com `NODE_ENV=production`, URLs HTTPS exatas, `TRUST_PROXY=1`, SMTP completo e segredos exclusivos.
5. No Google Cloud, cadastrar o callback e o webhook HTTPS finais, publicar/configurar o consentimento para producao e concluir verificacao e eventual security assessment aplicaveis ao scope `https://www.googleapis.com/auth/drive`.

Referencias do provedor: [Node.js na Hostinger](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/) e [limites dos planos](https://support.hostinger.com/en/articles/6976044-parameters-and-limits-of-hosting-plans).

## 2. Instalacao e inicializacao

```text
npm ci
npm run check
npm run migrate
npm run build
npm start
```

O backend inicia com `node backend/src/server.js`. O build estatico fica em `frontend/dist`; a hospedagem deve servir esse diretorio e encaminhar `/api` para o processo Node, preservando HTTPS e os cabecalhos do proxy.

## 3. Health check, logs e reinicio

- Health check: `GET https://listas.planteldeduvidas.com.br/api/saude`, esperando HTTP 200 e `{"status":"ok"}`.
- Logs: acompanhar stdout/stderr do processo Node no painel da hospedagem. Procurar codigos de erro de autenticacao, SMTP, Drive e sincronizacao; nunca copiar tokens, cookies ou segredos.
- Reinicio: usar o controle de restart da aplicacao Node da Hostinger. `SIGTERM`/`SIGINT` interrompem o monitor, fecham o servidor e encerram o pool MySQL.
- Depois do reinicio: validar health, login, uma leitura do acervo e os status administrativos do Drive/Changes API.

## 4. Migrations

- Executar `npm run migrate` uma vez por release, depois do backup e antes de liberar trafego.
- O comando registra cada arquivo em `migrations` e nao repete os ja aplicados.
- DDL do MySQL pode produzir commit implicito. Nao considerar `git revert` como rollback de banco.
- As migrations 001 a 013 sao cumulativas; nenhuma migration reversa destrutiva foi criada.

## 5. Google Drive

- Materiais fisicos ficam no Google Drive; MySQL guarda metadados, permissoes e historicos.
- Em Administracao > Google Drive, verificar conexao, ultima sincronizacao, acompanhamento por Changes API e necessidade de reconciliacao.
- Se a credencial estiver revogada/expirada, usar a reconexao OAuth administrativa. Nunca copiar refresh token para navegador, log ou relatorio.
- O webhook exige URL HTTPS publica. Polling continua como recuperacao; cada ciclo processa lote limitado para nao monopolizar as escritas.

## 6. SMTP

- Confirmar `SMTP_HOST`, porta, TLS, usuario, senha de aplicativo, remetente e `SUPPORT_EMAIL_TO` no ambiente protegido.
- Fazer um unico teste controlado de recuperacao e um de suporte depois da configuracao autorizada.
- Falha deve aparecer por codigo controlado; senha SMTP nunca deve aparecer em log.

## 7. Backup e restore MySQL

- Frequencia recomendada: diario, antes de toda migration/deploy e antes de operacao administrativa excepcional.
- Retencao inicial recomendada: 30 backups diarios e 12 mensais, ajustada ao plano e a requisitos legais.
- Manter uma copia gerenciada pela Hostinger e outra copia criptografada fora da conta de hospedagem, com acesso restrito ao responsavel operacional.
- Backup logico: `mysqldump --single-transaction --skip-lock-tables --no-tablespaces NOME_DO_BANCO > backup.sql` usando credenciais protegidas.
- Restore seguro: criar banco isolado, importar o dump, comparar tabelas, migrations e contagens essenciais, executar health/checks contra esse banco e so entao remover a base temporaria.
- Nunca restaurar por cima da producao sem janela, backup imediatamente anterior e autorizacao humana.

## 8. Rollback

1. Suspender novas escritas e registrar o incidente.
2. Reativar o commit estavel anterior da aplicacao.
3. Avaliar as migrations da release: se forem apenas aditivas e compativeis, manter o schema; se houver incompatibilidade, restaurar o backup em banco separado e validar antes da troca.
4. Validar health, autenticacao, acervo, Drive, SMTP e logs.
5. Reabrir trafego somente com autorizacao humana.

O commit estavel anterior desta fase e `b23976ab1dc8046f54acfae4c639a2ea08770da3`. A configuracao real, DNS, OAuth, backup definitivo e deploy continuam pendentes de acompanhamento humano.
