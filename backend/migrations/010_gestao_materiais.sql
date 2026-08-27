ALTER TABLE materiais
  MODIFY COLUMN ultima_sincronizacao_drive_id BIGINT UNSIGNED NULL,
  ADD COLUMN estado_gestao ENUM('disponivel', 'lixeira', 'exclusao_pendente', 'excluido')
    NOT NULL DEFAULT 'disponivel' AFTER disponivel,
  ADD COLUMN categoria_anterior_id BIGINT UNSIGNED NULL AFTER estado_gestao,
  ADD COLUMN enviado_lixeira_por_usuario_id BIGINT UNSIGNED NULL AFTER categoria_anterior_id,
  ADD COLUMN enviado_lixeira_em DATETIME(3) NULL AFTER enviado_lixeira_por_usuario_id,
  ADD COLUMN versao INT UNSIGNED NOT NULL DEFAULT 1 AFTER enviado_lixeira_em,
  ADD KEY idx_materiais_estado_gestao (estado_gestao, atualizado_em),
  ADD CONSTRAINT fk_materiais_categoria_anterior FOREIGN KEY (categoria_anterior_id)
    REFERENCES categorias(id) ON UPDATE RESTRICT ON DELETE SET NULL,
  ADD CONSTRAINT fk_materiais_lixeira_usuario FOREIGN KEY (enviado_lixeira_por_usuario_id)
    REFERENCES usuarios(id) ON UPDATE RESTRICT ON DELETE SET NULL;

CREATE TABLE auditoria_materiais (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  material_id BIGINT UNSIGNED NULL,
  usuario_id BIGINT UNSIGNED NOT NULL,
  operacao ENUM('upload', 'edicao', 'movimentacao', 'substituicao', 'lixeira', 'restauracao', 'exclusao_definitiva') NOT NULL,
  resultado ENUM('concluida', 'falhou', 'compensacao_pendente') NOT NULL,
  detalhes JSON NULL,
  criado_em TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_auditoria_materiais_material (material_id, criado_em),
  KEY idx_auditoria_materiais_usuario (usuario_id, criado_em),
  CONSTRAINT fk_auditoria_materiais_material FOREIGN KEY (material_id)
    REFERENCES materiais(id) ON UPDATE RESTRICT ON DELETE SET NULL,
  CONSTRAINT fk_auditoria_materiais_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
