# Camada ativa de defesa — Plantel Listas

Data: 24/09/2026. Estado: implementada e validada localmente, sem publicação.

## Revisão final solicitada — alertas, chave e degradação

Esta revisão substitui as referências originais abaixo a cooldown global único e chave derivada de CSRF.

- Alertas: cooldown por tipo + sujeito + escopo + regra + severidade; teto compartilhado por todas as instâncias de 10 HIGH e reserva independente de 2 CRITICAL por janela de 30 minutos, configuráveis. Um HIGH não consome a reserva crítica. Heurísticas atuais continuam produzindo HIGH; CRITICAL é reservado a produtores internos explícitos, nunca ao payload do cliente. Reservas e deduplicação são transacionais. Envios SMTP independentes e limitados por severidade, sem descartar um incidente apenas porque outro envio está em andamento. Quando a cota é esgotada, evidência e bloqueio permanecem; o e-mail não é enviado. Falha SMTP/capacidade local não tem retry durável.
- Migration 019 adiciona cotas e deduplicação persistentes; 018 não foi reescrita. Aplicada somente ao banco local isolado de testes. O campo antigo `proximo_alerta_ms` fica inerte por compatibilidade.
- `SECURITY_EVIDENCE_KEY`: chave exclusiva de 32 bytes aleatórios, representada por 64 caracteres hexadecimais. `.env.example` contém somente campo vazio e instrução; nenhum segredo operacional foi gerado ou exposto. Gerar via CSPRNG e guardar no ambiente protegido antes de ativar o serviço, inclusive localmente. Produção habilitada exige a configuração; ausência também impede instanciar o serviço/CLI. Validação de formato/reutilização/padrão trivial não prova entropia: a geração aleatória é responsabilidade operacional. Trocar CSRF não altera assinatura nem sujeito; trocar a chave de evidência exige planejar a verificação histórica. As evidências da implementação local anterior usam a chave antiga; não há conversão automática nem fallback para CSRF.
- Fallback novo não implementado: contagem paralela parcial durante falha poderia perder contexto da janela, divergir entre instâncias e criar falsos positivos. Bloqueios já confirmados permanecem no cache até seu TTL; falha de atualização não os apaga, não prolonga TTL e não bloqueia outros usuários. Novas restrições não confirmadas não são inventadas. Rate limits e autorizações anteriores continuam ativos. Essa decisão não elimina a dependência MySQL das operações normais do sistema.
- Testes: 36/36 direcionados; suíte final `npm run check` com 186/186 backend, 5/5 PWA e build Vite aprovados. Dois testes novos e ajustes pontuais cobrem cotas concorrentes, incidentes distintos, dedup, reserva crítica, rotação CSRF, configuração obrigatória, preservação/expiração do cache e usuários não envolvidos. SMTP simulado; nenhuma operação Google Drive real nesta revisão.
- Arquivos desta revisão: política/serviço/repositório de segurança, configuração de ambiente, CLI operacional, `.env.example`, migration 019, testes de camada ativa/ambiente/autenticação e este relatório. Fixtures usam chaves aleatórias efêmeras. Demais mudanças locais preservadas; sem commit, push, merge ou deploy.

Base conferida limpa: `codex/checkpoint-hardening`, commit `dee9923817cd793908889b9d8b325006916fd312`. Trabalho na nova branch local `security/camada-ativa`; HEAD permanece na base, alterações ainda não commitadas. Não houve push, merge, deploy ou alteração de produção.

## Arquitetura e bloqueio

Middleware central, serviço de decisão com cache limitado e repositório MySQL transacional. Não foram adicionadas dependências, Redis ou serviços pagos. As autorizações e rate limits anteriores continuam obrigatórios.

Eventos: `AUTH_FAILURE`, `ACCESS_DENIED`, `ADMIN_ACCESS_DENIED`, `CSRF_FAILURE`, `INVALID_SESSION`, `RATE_LIMIT_TRIGGERED`, `INVALID_UPLOAD`, `INVALID_WEBHOOK`, `RESOURCE_ENUMERATION`, `SUSPICIOUS_REQUEST`, `HONEYPOT_TRIGGERED`, `TEMPORARY_BLOCK`; operação manual registra `CONTAINMENT_CHANGED`.

Falhas isoladas não bloqueiam. Pesos por evento: autenticação/sessão/404 suspeito/enumeração = 1; acesso negado/CSRF/upload/rate limit = 2; webhook inválido = 3; acesso administrativo negado = 4; canário = 10. Respostas de erro do provider Google não são atribuídas automaticamente ao usuário. `/me` sem sessão é inicialização normal e não pontua.

| Política padrão | Valor |
| --- | --- |
| Janela | 10 minutos |
| Suspeita / pausa / bloqueio autenticado | 10 / 30 / 60 pontos |
| Multiplicador anônimo | 3; limites 30 / 90 / 180 |
| Pausa | 30 segundos, uma vez por janela |
| Bloqueio temporário | 15 minutos, sem renovação por tentativas durante bloqueio |
| Enumeração | 12 IDs recusados distintos com padrão sequencial no mesmo grupo; 36 para anônimos |
| Atualização entre processos | 5 segundos, acrescidos do tempo de consulta |
| Alerta SMTP | Cooldown por incidente e cotas HIGH/CRITICAL; ver revisão acima |
| Retenção configurada | 30 dias, limpeza por comando explícito |

Usuário autenticado é identificado pelo ID validado da sessão, não pelo e-mail submetido. Anônimos usam IP validado conforme a configuração de proxy. Escopos separados: autenticação pública, webhook e aplicação. Restrição autenticada acompanha o usuário mesmo se trocar IP; não se propaga para outro usuário autenticado da mesma rede. Logout permanece disponível.

Antes dos controllers protegidos, o bloqueio devolve 429 genérico, `Retry-After` e `Cache-Control: no-store`. Autenticação pública e webhook são verificados antes do parser; rotas autenticadas são verificadas depois de validar a sessão e antes da operação. O canário `/api/_security/canary` não executa negócio: inicialmente retorna 404 e, após padrão persistente, 429. IDs percent-encoded são normalizados na política de contenção.

Limitação deliberada: restrições anônimas de escopo `app` são consultadas no canário; não há firewall global por IP na navegação autenticada. URLs desconhecidas e sessões inválidas continuam negadas pelos controles originais, sem bloquear indiscriminadamente usuários válidos atrás de NAT. Não é proteção contra DDoS volumétrico nem contra ataques distribuídos de baixa frequência.

## Persistência, evidências e alertas

Migration nova `018_camada_ativa_seguranca.sql`: `seguranca_agregados`, `seguranca_eventos`, `seguranca_controle`. Migrations anteriores intactas. Aplicada somente ao banco local isolado de testes. Eventos, contagem, restrição e reserva do alerta são confirmados na mesma transação, com rollback e liberação da conexão. UPSERT seguido de lock exclusivo evita o deadlock de promoção de locks encontrado no teste concorrente.

Evidência inclui horário, request ID, ID interno quando autenticado, IP técnico, família/hash do User-Agent, rota normalizada, método, regra e resposta. Nunca copia corpo, query string, cookies, senha, tokens ou User-Agent bruto. IP e ID interno continuam sendo dados sensíveis operacionalmente: restringir acesso ao banco e aplicar retenção.

HMAC-SHA256 com chave derivada via HKDF de SECURITY_EVIDENCE_KEY detecta alteração do conteúdo assinado; CLI verifica sem imprimir evidências. Não prova identidade civil, não detecta exclusão/reordenação/rollback integral do banco e não resiste a comprometimento da chave. Rotação dessa chave exige planejar verificação das evidências antigas e reinicia a identidade criptográfica dos agregados. Rotação CSRF não interfere.

Alertas HIGH reutilizam SMTP existente; destinatário `SECURITY_ALERT_EMAIL_TO`, com fallback para suporte. Sem destinatário, não envia. Falha de SMTP não desfaz o bloqueio: gera log sanitizado. Não há outbox durável/reenvio; o cooldown reservado permanece consumido. Nenhum e-mail real foi enviado nesta validação.

## Contenção manual e operação

Desligada por padrão. Ativação explícita e auditada bloqueia escritas de usuários/permissões/categorias/disciplinas/concursos/analytics/auditoria, exclusão permanente de material e operações de integração OAuth/Drive. Retorna 503 temporário. Preserva leitura, logout, upload normal e webhook; não é um modo global somente leitura e não interrompe workers ou operações já iniciadas.

Comandos a partir da raiz, usando o ambiente selecionado pelo operador:

```text
npm run security:ops --workspace backend -- status
npm run security:ops --workspace backend -- conter on identificador-operador
npm run security:ops --workspace backend -- conter off identificador-operador
npm run security:ops --workspace backend -- verificar
npm run security:ops --workspace backend -- limpar
```

O identificador do operador é declarado por quem possui acesso operacional, não uma autenticação adicional. Proteger terminal, ambiente e credenciais do banco. `limpar` remove no máximo 1.000 registros expirados de cada tabela por chamada; não foi agendado automaticamente.

## Carga e degradação

Consulta normal usa cache, sem SQL extra por requisição. Snapshot faz duas leituras periódicas. Cache/amostragem limitados a 10 mil entradas. Eventos limitados a quatro operações pendentes, 20 admissões/segundo, 120/minuto/processo e intervalo mínimo de 250 ms por sujeito/escopo. Excesso é amostrado, sem fila ilimitada; portanto não há promessa de registrar todas as tentativas sob ataque.

Persistência de evento pode acrescentar até 2,5 segundos de espera na resposta suspeita; a tarefa pode terminar depois, mantendo o limite de concorrência. Consultas têm timeout de 2 segundos. Falha de persistência não cria bloqueio não confirmado e não derruba o fluxo original. Falha de atualização conserva restrições conhecidas até seu TTL, mas novos bloqueios entre instâncias podem demorar. Falha ao carregar estado inicial impede startup com defesa habilitada, inclusive se faltar migration 018. Logs de degradação são limitados a um por minuto.

## Testes e resultados

`npm run check`: **186/186 backend, 5/5 PWA e build Vite de 40 módulos aprovados** após revisão final. `git diff --check` aprovado. Sem alteração frontend/dependências e sem operação destrutiva no Google Drive real.

Nove testes novos cobrem classificação e erros isolados; progressão/TTL/logout/isolamento NAT; concorrência/persistência/restart/alerta deduplicado; enumeração versus repetição e paginação; sanitização/HMAC/limpeza; canário e bloqueio público; contenção manual e ID codificado; HTTP com sessão real e CSRF válido impedido antes de escrita; cache, amostragem, orçamento e falha de persistência. MySQL local real, SMTP fake e relógio controlado. A camada é ativada explicitamente nos testes novos; os 175 testes legados mantêm seus doubles/ambiente anteriores.

Microensaio final: 200 verificações de cache em aproximadamente 2,93 ms no total, zero consultas adicionais. Não representa benchmark de produção nem teste de carga distribuída.

## Arquivos

Criados: migration 018; `backend/src/modules/seguranca/{politicaDefesa,defesaRepository,defesaService}.js`; `backend/scripts/operarSeguranca.js`; `backend/test/camadaAtiva.integracao.test.js`; este relatório.

Alterados: `.env.example`; `backend/package.json`; `backend/src/app.js`; `backend/src/server.js`; middleware de autenticação; configuração de ambiente; middlewares de rate limit e erros; provider SMTP.

## Antes de eventual publicação autorizada

Aplicar migration 018 após backup no ambiente correto e antes do novo servidor; validar `TRUST_PROXY` para não confiar em IP forjado; revisar limiares com tráfego real e redes compartilhadas; conferir destinatário e validar SMTP; sincronizar relógios; agendar retenção em lotes; controlar acesso às evidências e ao comando de contenção. Com múltiplas instâncias, os orçamentos de amostragem são por processo, enquanto restrições e cooldown são persistentes/compartilhados.

Conclusão: camada implementada e validada localmente, com bloqueio efetivo nos fluxos descritos e sem banimento permanente automático. Proteção complementar, não garantia absoluta de prevenção. Nenhuma ação de publicação foi executada.
