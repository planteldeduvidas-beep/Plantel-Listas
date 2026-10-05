CREATE TABLE solicitacoes_exclusao_pastas (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  categoria_id BIGINT UNSIGNED NULL,
  solicitante_id BIGINT UNSIGNED NOT NULL,
  pasta_nome VARCHAR(120) NOT NULL,
  drive_pasta_id VARCHAR(255) NOT NULL,
  categoria_pai_id BIGINT UNSIGNED NULL,
  estado ENUM('pendente','aprovada','recusada') NOT NULL DEFAULT 'pendente',
  decidido_por BIGINT UNSIGNED NULL,
  criado_em TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  decidido_em TIMESTAMP(3) NULL,
  PRIMARY KEY (id),
  KEY idx_solicitacoes_estado (estado,id),
  KEY idx_solicitacoes_pasta (categoria_id,estado),
  KEY idx_solicitacoes_autor (solicitante_id,id),
  CONSTRAINT fk_solicitacoes_pasta FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL,
  CONSTRAINT fk_solicitacoes_autor FOREIGN KEY (solicitante_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_solicitacoes_admin FOREIGN KEY (decidido_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
