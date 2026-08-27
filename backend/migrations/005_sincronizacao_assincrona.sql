ALTER TABLE sincronizacoes_google_drive
  MODIFY COLUMN status ENUM(
    'aguardando',
    'em_andamento',
    'sincronizando',
    'concluida',
    'falhou'
  ) NOT NULL,
  MODIFY COLUMN iniciada_em DATETIME(3) NULL,
  ADD COLUMN solicitada_em DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) AFTER status;

UPDATE sincronizacoes_google_drive
SET status = 'sincronizando'
WHERE status = 'em_andamento';

ALTER TABLE sincronizacoes_google_drive
  MODIFY COLUMN status ENUM(
    'aguardando',
    'sincronizando',
    'concluida',
    'falhou'
  ) NOT NULL;

ALTER TABLE credenciais_google_drive
  ADD COLUMN renovacao_necessaria TINYINT(1) NOT NULL DEFAULT 0 AFTER escopo,
  ADD COLUMN erro_codigo VARCHAR(100) NULL AFTER renovacao_necessaria,
  ADD COLUMN invalidada_em DATETIME(3) NULL AFTER erro_codigo,
  ADD KEY idx_credenciais_google_drive_renovacao (renovacao_necessaria);
