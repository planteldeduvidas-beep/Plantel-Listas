ALTER TABLE sincronizacoes_google_drive
  MODIFY COLUMN iniciado_por_usuario_id BIGINT UNSIGNED NULL,
  ADD COLUMN origem ENUM('manual', 'changes') NOT NULL DEFAULT 'manual' AFTER iniciado_por_usuario_id;

ALTER TABLE estado_changes_google_drive
  ADD COLUMN reconciliacao_necessaria TINYINT(1) NOT NULL DEFAULT 0 AFTER ultima_verificacao_em,
  ADD CONSTRAINT chk_estado_changes_reconciliacao CHECK (reconciliacao_necessaria IN (0, 1));
