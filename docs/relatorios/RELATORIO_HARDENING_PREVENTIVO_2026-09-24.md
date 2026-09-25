# Hardening preventivo de cibersegurança — Plantel Listas

Data: 24/09/2026. Branch: `fase/09-qa-producao`.
Base analisada: `12e7182d9af2d814b7c7fe6fad69ff1acfc17411`.
Estado: **correções locais validadas; sem publicação**.

## Resultado executivo

Foram corrigidos cinco grupos de riscos concretos, sem alteração de arquitetura, schema ou permissões de negócio. Não foi identificada vulnerabilidade crítica ou alta confirmada nesta revisão. Isso não constitui garantia de ausência de vulnerabilidades nem certificação da produção.

## Achados e correções

| Severidade | Componente / causa | Impacto se não corrigido | Defesa implementada |
| --- | --- | --- | --- |
| MÉDIA | `logger.js` / `app.js`: serialização integral de erros e registro de `Referer` | Erros de drivers podem transportar SQL, dados de requisição e credenciais; o Referer pode transportar token de recuperação | Serializer de erro por allowlist: código, tipo e localizações; exclusão de mensagem, SQL, payload, configuração e causa. Referer redigido. Aplicado também ao logger HTTP, que possui serializer próprio |
| MÉDIA | `gestaoMateriaisRoutes.js`: autorização de papel somente no service, depois do multipart | Aluno autenticado podia consumir processamento/disco de upload antes de receber 403; não foi demonstrada escrita indevida no Drive | Papel professor/admin exigido antes do parser. Autorizações por pasta e restrições administrativas existentes permanecem |
| MÉDIA | Consulta da biblioteca: queries recursivas sem limite de frequência | Usuário autenticado podia repetir consultas caras sem contenção na aplicação | 120 consultas/minuto por usuário autenticado, resposta 429 antes do controller. `ACERVO_QUERY_RATE_LIMIT_MAX` opcional, validado entre 10 e 1.000. Não aplicado a conteúdo/download/Range |
| BAIXA | `acervoValidator.js` / `gestaoMateriaisValidator.js`: lookup de ordenação herdada e inteiros sem precisão segura | `constructor`/`toString` passavam na allowlist e chegavam à montagem do ORDER BY; IDs extremos sofriam arredondamento/overflow | `Object.hasOwn` e tipo string na ordenação; `Number.isSafeInteger` nos IDs. Não foi demonstrada execução de SQL arbitrário |
| BAIXA | `tratarErros.js`: erros conhecidos de JSON tratados como falha interna | JSON inválido/corpo excessivo retornavam 500 e podiam gerar registros com payload do parser | Respostas controladas 400/413, sem eco de dados nem stack desses erros |

Os cinco testes iniciais reproduziram as falhas no código anterior. Foram acrescentados dois casos necessários para cobrir especificamente o serializer HTTP e o limite da consulta, totalizando **sete testes novos**.

## Superfícies revisadas e evidências

| Área | Evidência e resultado no escopo local |
| --- | --- |
| Autenticação e sessões | Argon2id; tokens aleatórios armazenados por hash; cookies HttpOnly/SameSite e Secure em produção; sessão consultada no banco com versão/expiração/estado. Testes de login, logout, CSRF, sessão adulterada/expirada, rate limit e recuperação de uso único aprovados |
| Autorização | Rotas administrativas protegidas no servidor; permissões de professor por categoria/disciplina; histórico limitado ao usuário da sessão. Testes de papel, IDOR, mass assignment, raiz Drive e pastas não autorizadas aprovados |
| SQL e transações | Valores parametrizados; identificadores dinâmicos internos e ordenação revisados. Testes de constraints, rollback da auditoria, papel × concessão, login × redefinição, hierarquia e locks aprovados. Migrations 001–017 já presentes no banco isolado; nenhuma migration alterada |
| Drive/OAuth | State com hash, usuário, expiração e consumo único; refresh token AES-GCM; diferenciação 401/403; canal webhook/token/resource e deduplicação; bootstrap, subárvores e cursor. Journal/compensação/retry e commit incerto preservados e testados com provider simulado |
| Aplicação web | Helmet/CSP, CORS por origem exata, CSRF, cache privado; sem sink `dangerouslySetInnerHTML`/`innerHTML` encontrado no frontend nem execução de shell no backend de runtime. Chamadas externas concentradas no provider Google/SMTP, não em URL arbitrária enviada por aluno |
| Arquivos e recursos | Extensão + MIME + assinatura, limites de tamanho, nomes seguros, arquivo temporário, autorização antes da entrega e Range. Pool com fila finita/timeout e mínimo de duas conexões; timeouts de Drive/SMTP existentes. Corrigidos o upload pré-autorização e a frequência da consulta |
| Frontend/PWA | Bundle produzido sem source maps; nenhuma correspondência com segredos locais identificada. Service worker restringe cache a assets versionados e ignora API, páginas e arquivos privados; limpeza de caches antigos e fluxo de atualização preservados |
| Configuração e segredos | Produção exige HTTPS, proxy e integrações obrigatórias. `.env` real não rastreado; exemplos não contêm segredo real detectado. Varredura por padrões fortes e comparação em memória com segredos locais em arquivos rastreados/bundle não encontrou correspondências; valores nunca impressos |

OAuth aqui é a integração administrativa do Drive; não foi presumido um login social de usuários que não existe nesse fluxo.

## Validação executada

- Testes dirigidos de hardening, logs, erros, upload e ambiente: aprovados após as correções.
- `npm run check` final: **175/175 testes backend**, **5/5 testes PWA**, build Vite aprovado (**40 módulos**), sem skips/falhas. Uma rodada anterior passou com 174 testes; foi repetida somente porque o limite de consultas foi acrescentado depois.
- `npm audit` e `npm audit --omit=dev`: **zero vulnerabilidades conhecidas** na consulta desta execução; isso não substitui a revisão do código.
- `git diff --check`: aprovado.
- Banco utilizado: **MySQL local isolado `plantel_listas_test`**. Não houve operação no Drive real, envio SMTP real ou alteração de produção.
- Reauditoria focada do diff: papel barrado antes do multipart; allowlist não aceita propriedades herdadas; erros sanitizados também no logger HTTP; parser não ecoa dados; limite usa identidade da sessão, não ID enviado pelo cliente, e não interfere no streaming.

## Riscos residuais e ações humanas

- Não foram verificados privilégios efetivos do usuário MySQL de produção, configuração real de proxy/HTTPS/Hostinger, logs históricos nem políticas de retenção. Confirmar menor privilégio e quantidade correta de proxies antes de publicar.
- Nenhuma credencial exposta foi identificada nas verificações executadas; não há rotação indicada por um achado confirmado. Como os logs anteriores admitiam dados sensíveis de erros/Referer, revisar esses logs em ambiente protegido; se houver exposição, restringir/remover o registro e rotacionar/revogar a credencial afetada. Não foi feita busca exaustiva em todos os blobs do histórico Git.
- Confirmar que a chave de criptografia Drive de produção é exclusiva e diferente de CSRF; a validação atual exige presença/comprimento, não testa igualdade. Não substituir uma chave em uso sem planejar recriptografia/reconexão.
- Rate limits são locais ao processo e reiniciam com ele; não substituem proteção de borda nem contenção distribuída. O novo limite protege a consulta da biblioteca, não pretende limitar todo endpoint ou impedir ataques volumétricos. Ajustar com métricas reais, sem desabilitar a defesa.
- Magic bytes não equivalem a antivírus ou validação integral do PDF/vídeo. A retomada Drive/MySQL é eventual: indisponibilidade externa e falha de compensação exigem monitorar o journal; não existe transação distribuída capaz de garantir ausência absoluta de órfãos.
- Testes de Google/SMTP usam doubles. A instalação/atualização em aparelhos reais e o OAuth/SMTP/Drive de produção **não foram revalidados ao vivo**. Os testes locais demonstram preservação dos contratos, não disponibilidade de terceiros.

## Arquivos modificados

- `.env.example`;
- `backend/src/app.js`;
- `backend/src/modules/materiais/acervoRoutes.js`;
- `backend/src/modules/materiais/acervoValidator.js`;
- `backend/src/modules/materiais/gestaoMateriaisRoutes.js`;
- `backend/src/modules/materiais/gestaoMateriaisValidator.js`;
- `backend/src/shared/config/ambiente.js`;
- `backend/src/shared/config/logger.js`;
- `backend/src/shared/middlewares/criarRateLimiters.js`;
- `backend/src/shared/middlewares/tratarErros.js`;
- `backend/test/hardeningPreventivo.test.js` (novo);
- este relatório (novo).

## Conclusão

Regras de negócio e funcionalidades preservadas nos testes executados; nenhuma regressão conhecida nessa validação. Backend/MySQL local integrados e frontend compilado; contratos Drive/OAuth/SMTP e PWA aprovados nos respectivos testes, com as limitações explícitas acima. Não é possível afirmar integração real de produção sem smoke test autorizado.

Árvore inicialmente limpa; agora contém dez arquivos rastreados modificados e dois novos, sem staging/commit. HEAD permanece na base informada. **Sem commit, push, deploy ou alteração de produção. STOP.**

Referências: [OWASP ASVS 5.0](https://github.com/OWASP/ASVS/tree/v5.0.0/5.0), [Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html), [Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html) e [File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html).
