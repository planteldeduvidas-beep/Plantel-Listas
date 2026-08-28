ALTER TABLE eventos_uso_acervo
  MODIFY COLUMN material_id BIGINT UNSIGNED NULL,
  MODIFY COLUMN tipo ENUM('acesso', 'busca', 'visualizacao', 'download') NOT NULL,
  ADD COLUMN categoria_id BIGINT UNSIGNED NULL AFTER material_id,
  ADD COLUMN termo_busca VARCHAR(120) NULL AFTER tipo,
  ADD KEY idx_eventos_uso_categoria_data (categoria_id, criado_em),
  ADD KEY idx_eventos_uso_busca_data (tipo, termo_busca, criado_em),
  ADD CONSTRAINT fk_eventos_uso_categoria FOREIGN KEY (categoria_id)
    REFERENCES categorias(id) ON UPDATE RESTRICT ON DELETE SET NULL;
