CREATE TABLE eventos_uso_acervo (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id BIGINT UNSIGNED NOT NULL,
  material_id BIGINT UNSIGNED NOT NULL,
  tipo ENUM('visualizacao', 'download') NOT NULL,
  chave_deduplicacao VARCHAR(180) NOT NULL,
  criado_em TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_eventos_uso_deduplicacao (chave_deduplicacao),
  KEY idx_eventos_uso_tipo_data (tipo, criado_em),
  KEY idx_eventos_uso_material_tipo_data (material_id, tipo, criado_em),
  KEY idx_eventos_uso_usuario_data (usuario_id, criado_em),
  CONSTRAINT fk_eventos_uso_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT fk_eventos_uso_material FOREIGN KEY (material_id)
    REFERENCES materiais(id) ON UPDATE RESTRICT ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE auditoria_geral (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ator_usuario_id BIGINT UNSIGNED NULL,
  acao VARCHAR(80) NOT NULL,
  entidade VARCHAR(40) NOT NULL,
  entidade_id BIGINT UNSIGNED NULL,
  resultado ENUM('concluida', 'falhou') NOT NULL DEFAULT 'concluida',
  contexto JSON NULL,
  criado_em TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_auditoria_geral_data (criado_em, id),
  KEY idx_auditoria_geral_acao_data (acao, criado_em),
  KEY idx_auditoria_geral_ator_data (ator_usuario_id, criado_em),
  KEY idx_auditoria_geral_entidade (entidade, entidade_id, criado_em),
  CONSTRAINT fk_auditoria_geral_ator FOREIGN KEY (ator_usuario_id)
    REFERENCES usuarios(id) ON UPDATE RESTRICT ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE usuarios
  ADD KEY idx_usuarios_papel_ativo_email (papel, ativo, email, id),
  ADD KEY idx_usuarios_criado_em (criado_em, id);

ALTER TABLE materiais
  ADD KEY idx_materiais_criado_tipo_estado (criado_em, tipo, estado_gestao, disponivel);
