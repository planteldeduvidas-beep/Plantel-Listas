CREATE TABLE professor_disciplinas (
  professor_id BIGINT UNSIGNED NOT NULL,
  disciplina_id BIGINT UNSIGNED NOT NULL,
  concedida_por_usuario_id BIGINT UNSIGNED NOT NULL,
  concedida_em TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (professor_id, disciplina_id),
  KEY idx_professor_disciplinas_disciplina (disciplina_id, professor_id),
  CONSTRAINT fk_professor_disciplinas_professor FOREIGN KEY (professor_id) REFERENCES usuarios(id) ON DELETE RESTRICT,
  CONSTRAINT fk_professor_disciplinas_disciplina FOREIGN KEY (disciplina_id) REFERENCES disciplinas(id) ON DELETE RESTRICT,
  CONSTRAINT fk_professor_disciplinas_admin FOREIGN KEY (concedida_por_usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE operacoes_google_drive_pendentes
  MODIFY COLUMN tipo ENUM('upload', 'edicao', 'movimentacao', 'substituicao', 'lixeira', 'restauracao', 'exclusao_definitiva', 'pasta_criacao', 'pasta_renomeacao') NOT NULL;
