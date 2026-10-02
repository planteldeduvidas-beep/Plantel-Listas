# Upload retomável de materiais — implementação local

## Protocolo

`POST /api/uploads` inicia/idempotentemente recupera a sessão identificada por UUID.
O backend valida perfil, pasta, título, MIME, extensão, assinatura inicial e tamanho.
O Google gera previamente o ID do arquivo; o cliente não escolhe esse ID nem a URI Google.
A URI resumable fica criptografada (AES-GCM, chave da integração Drive) na tabela
`uploads_retomaveis`, migration `023_uploads_retomaveis.sql`.

`PUT /api/uploads/:id/partes`: corpo binário, Content-Length e X-Upload-Offset.
`GET /api/uploads/:id`: consulta o progresso efetivo no Drive.
`POST /api/uploads/:id/finalizar`: confirma arquivo e transação SQL.
`DELETE /api/uploads/:id`: cancela; não apaga material já concluído.

Todos exigem autenticação, perfil de gestão, proprietário da sessão e autorização atual
sobre a pasta. Mutações exigem CSRF. Pasta, título, tipo e tamanho são imutáveis.
Assinatura declarada no início é novamente comparada com os bytes reais da primeira parte.
Esta é a mesma validação de assinatura/extensão do fluxo anterior, não um antivírus ou
uma validação completa da estrutura interna do vídeo.

## Limites e recursos

- 4 MiB por parte (16 × 256 KiB, compatível com Drive).
- Padrão de vídeo retomável: 3072 MiB (3 GiB). Configurável entre 1 e 5000 MiB.
- PDF mantém `UPLOAD_MAX_PDF_MB` (padrão 50 MiB).
- Uma sessão pendente por usuário e quatro globais, persistidas no banco.
- Até quatro corpos de partes recebidos simultaneamente por processo; o buffer não é
  liberado logicamente ao cliente desconectar enquanto ainda houver operação em execução.
- 300 requisições/minuto/usuário; início também usa o rate limit de upload existente.
- 30 segundos por recebimento de parte e por requisição ao Google; não aumenta timeout global.
- Frontend tem deadline de 45 segundos e até duas retentativas por operação, com espera;
  429 aguarda um minuto. Três respostas sem avanço interrompem o laço.
- RAM é proporcional a partes, não ao arquivo: payload de até 16 MiB simultâneo por
  processo, mais buffers/cópias do parser, fetch, runtime e restante da aplicação.
- Nenhum arquivo completo nem parte é escrito no disco pelo novo fluxo.

4 MiB é uma escolha conservadora de payload, não uma medição do limite da Hostinger.
Um bloco leva cerca de 6,7 segundos numa conexão de 5 Mbit/s (sem overhead).
Conexões muito lentas podem atingir o prazo; não aumentar arbitrariamente timeouts.

## Retomada, consistência e limpeza

O offset vem do Range do Google (308), não do número de bytes enviados pelo navegador.
200/201 só significa conclusão externa; ainda falta finalização SQL. Após timeout, a
próxima ação consulta o progresso antes de enviar mais bytes. URI expirada resulta em
410; se o Drive já concluiu e perdeu-se a resposta, o ID reservado permite recuperar o
arquivo exato e validar ID, tamanho, nome, tipo e pasta.

O backend reutiliza a trava de operações Drive atual em cada operação curta. Não segura
uma transação SQL durante a transferência. Material, auditoria e estado concluído da
sessão são gravados juntos. Falha SQL preserva arquivo/sessão para finalizar novamente;
commit com resposta perdida é resolvido relendo a sessão. Não apagar arquivo nesse caso.
As sincronizações completa/incremental ignoram IDs de sessões não concluídas, impedindo
publicação antecipada ou ressurgimento de um cancelamento ainda em reconciliação.

Sessões expiram em 24 horas. O monitor, a cada 65 segundos, trata lotes de quatro sessões,
exclui o ID reservado se houver arquivo, preserva tombstones e remove registros terminais
após oito dias. Rechecagens de cancelados após expiração detectam conclusão externa tardia.
Falhas de limpeza são registradas sem credenciais e limitadas a vinte tentativas; depois
exigem intervenção operacional (não são descartadas silenciosamente). Sessões incompletas
no Google não são publicadas como materiais; sua URI nunca é entregue ao navegador.

O navegador guarda somente UUID, dados de seleção e metadados na chave de localStorage
específica do usuário. Ao reabrir, deve selecionar o mesmo arquivo. Nome, tamanho,
lastModified e SHA-256 das amostras inicial/final evitam retomada acidental de outra seleção;
isso não equivale ao hash integral do arquivo. Sem localStorage a retomada se limita à tela
aberta. Não há upload garantido em segundo plano: fechar/suspender PWA interrompe, e o
usuário deve reabrir para retomar. Não foi acrescentado cache de API ao service worker.

## Implantação futura (NÃO executada)

1. Aplicar migration 023 antes do backend novo, no mesmo banco atual, com backup normal.
2. Configurar `UPLOAD_RESUMABLE_MAX_VIDEO_MB=3072` na Hostinger; padrão do código é 3072.
   Não precisa elevar `UPLOAD_MAX_VIDEO_MB` nem configurar limites PHP.
3. Preservar GOOGLE_DRIVE_ENCRYPTION_KEY, credenciais OAuth, CSRF e demais variáveis.
4. Verificar no ambiente real suporte a PUT de 4 MiB, Content-Range para Google e
   X-Upload-Offset entre navegador e backend, sem buffering/rejeição inesperada no proxy.
5. Testar controladamente professor/admin, mobile/PWA, interrupção, retomada, finalização
   e uma transferência grande real. Os testes locais usam Drive simulado, não comprovam
   desempenho, limites externos, armazenamento/quota ou execução em segundo plano.

Não desabilitar CDN, CSRF ou permissões para contornar rejeição. Se o proxy bloquear
4 MiB, interromper a publicação e medir o limite antes de ajustar o tamanho.

## Compatibilidade e limitações

Uploads novos de PDF/vídeo usam o novo protocolo. O endpoint multipart anterior continua
disponível com os limites anteriores. Substituição de material permanece no fluxo simples
e não ganha suporte a 2,5 GiB nesta alteração. Não há nova infraestrutura/dependência.
O limite global de quatro sessões e a trava Drive existente priorizam integridade;
concorrência maior e múltiplos processos exigem dimensionamento futuro.

## Evidencia local (2026-10-02)

- Migration 023 aplicada somente em `plantel_listas_test`.
- `npm run check`: 221/221 backend, 5/5 PWA e build Vite aprovados.
- `node --test frontend/test/*.test.js`: 16/16 aprovados (inclui os cinco PWA).
- Regressao integrada: professor autorizado, CSRF ausente, pasta proibida, outro
  proprietario, bloco repetido, finalizacao incompleta, material invisivel antes de
  finalizar, falha real de gravacao SQL simulada na auditoria com rollback, retomada,
  biblioteca e auditoria unica. MySQL local real; Google Drive simulado.
- Regressao de protocolo: 308/Range, 200/201, 400/401/403/404/429/503, timeout e URI restrita.
- Caso de 2,5 GiB testa tamanho e offsets acima de 2 GiB sem buffer gigante. Nao houve
  transferencia externa de 2,5 GiB, teste fisico Android/iOS ou validacao do proxy nesta etapa.
- `git diff --check` sem erros. Nenhum commit, push ou deploy.

## Arquivos desta entrega

Novos:

- `backend/migrations/023_uploads_retomaveis.sql`
- `backend/src/modules/materiais/uploadRetomavelRepository.js`
- `backend/src/modules/materiais/uploadRetomavelService.js`
- `backend/src/modules/materiais/uploadRetomavelRoutes.js`
- `backend/test/uploadRetomavel.test.js`
- `backend/test/uploadRetomavelProvider.test.js`
- `backend/test/uploadRetomavelRoutes.test.js`
- `frontend/src/uploadRetomavel.js`
- `frontend/test/uploadRetomavel.test.js`
- `docs/upload-retomavel.md`

Alterados:

- `.env.example`
- `backend/src/app.js`, `backend/src/server.js`
- `backend/src/shared/config/ambiente.js`
- `backend/src/shared/providers/googleDriveProvider.js`
- `backend/src/modules/materiais/gestaoMateriaisValidator.js`
- `backend/src/modules/materiais/gestaoMateriaisService.js`
- `backend/src/modules/materiais/gestaoMateriaisRepository.js`
- `backend/src/modules/materiais/googleDriveChangesRepository.js`
- `backend/src/modules/materiais/integracaoGoogleDriveRepository.js`
- `backend/test/gestaoMateriais.integracao.test.js`
- `backend/test/navegacaoFrontend.test.js`
- `frontend/src/api.js`, `frontend/src/BibliotecaAcervo.jsx`
- `frontend/src/ComponentesInterface.jsx`, `frontend/src/styles.css`
- `frontend/src/Tutorial.jsx`
