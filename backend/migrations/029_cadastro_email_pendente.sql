-- Somente cadastros publicos futuros recebem esta marca. Sem backfill.
CREATE TABLE IF NOT EXISTS cadastros_email_pendentes (
  usuario_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  criado_em TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_cadastro_email_pendente_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);
