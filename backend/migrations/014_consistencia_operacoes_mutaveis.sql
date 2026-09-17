CREATE TABLE operacoes_google_drive_pendentes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  chave VARCHAR(36) NOT NULL,
  tipo ENUM('upload', 'edicao', 'movimentacao', 'substituicao', 'lixeira', 'restauracao', 'exclusao_definitiva') NOT NULL,
  material_id BIGINT UNSIGNED NULL,
  usuario_id BIGINT UNSIGNED NULL,
  fase ENUM('preparada', 'drive_confirmado', 'commit_incerto', 'compensacao_pendente', 'reconciliacao_pendente', 'concluida') NOT NULL DEFAULT 'preparada',
  detalhes JSON NULL,
  tentativas INT UNSIGNED NOT NULL DEFAULT 0,
  proxima_tentativa_em DATETIME(3) NULL,
  ultimo_erro_codigo VARCHAR(100) NULL,
  criada_em TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  atualizada_em TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  concluida_em DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_operacoes_drive_chave (chave),
  KEY idx_operacoes_drive_pendentes (fase, proxima_tentativa_em, id),
  KEY idx_operacoes_drive_material (material_id, id),
  CONSTRAINT fk_operacoes_drive_material FOREIGN KEY (material_id)
    REFERENCES materiais(id) ON UPDATE RESTRICT ON DELETE SET NULL,
  CONSTRAINT fk_operacoes_drive_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON UPDATE RESTRICT ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE usuarios
  ADD COLUMN versao_sessao INT UNSIGNED NOT NULL DEFAULT 1 AFTER senha_hash;

ALTER TABLE sessoes
  ADD COLUMN usuario_versao INT UNSIGNED NOT NULL DEFAULT 1 AFTER usuario_id,
  ADD KEY idx_sessoes_usuario_versao (usuario_id, usuario_versao, revogada_em);
