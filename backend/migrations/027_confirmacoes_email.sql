-- Confirmacao voluntaria de e-mail e troca sem modificar contas existentes.
CREATE TABLE IF NOT EXISTS confirmacoes_email (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id BIGINT UNSIGNED NOT NULL,
  email_anterior VARCHAR(254) NOT NULL,
  email_destino VARCHAR(254) NOT NULL,
  usuario_versao BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expira_em DATETIME(3) NOT NULL,
  usada_em DATETIME(3) NULL,
  cancelada_em DATETIME(3) NULL,
  criado_em TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_confirmacoes_email_token (token_hash),
  KEY idx_confirmacoes_email_usuario (usuario_id, cancelada_em, usada_em),
  CONSTRAINT fk_confirmacoes_email_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
