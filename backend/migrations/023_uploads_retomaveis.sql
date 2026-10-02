CREATE TABLE uploads_retomaveis (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  usuario_id BIGINT UNSIGNED NOT NULL,
  categoria_id BIGINT UNSIGNED NOT NULL,
  drive_id VARCHAR(255) NOT NULL UNIQUE,
  dados JSON NOT NULL,
  sessao_criptografada TEXT NULL,
  tamanho BIGINT UNSIGNED NOT NULL,
  recebido BIGINT UNSIGNED NOT NULL DEFAULT 0,
  estado VARCHAR(24) NOT NULL DEFAULT 'preparando',
  material_id BIGINT UNSIGNED NULL,
  tentativas_limpeza SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  criado_em DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  atualizado_em DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expira_em DATETIME(3) NOT NULL,
  INDEX idx_upload_usuario_estado (usuario_id, estado),
  INDEX idx_upload_expiracao (estado, expira_em)
);
