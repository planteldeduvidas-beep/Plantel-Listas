-- Aditiva: nao migra/exclui contas nem atribui confirmacoes historicas.
ALTER TABLE usuarios ADD COLUMN excluido_em TIMESTAMP(3) NULL;
ALTER TABLE usuarios ADD COLUMN email_confirmado_em TIMESTAMP(3) NULL;
CREATE TABLE cadastros_publicos_pendentes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  email VARCHAR(254) NOT NULL,
  email_destino VARCHAR(254) NOT NULL,
  senha_hash VARCHAR(255) NOT NULL,
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  expira_em DATETIME(3) NULL,
  enviado_em TIMESTAMP(3) NULL,
  criado_em TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_cadastro_publico_email(email),
  UNIQUE KEY uq_cadastro_publico_token(token_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
