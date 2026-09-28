ALTER TABLE operacoes_google_drive_pendentes
  MODIFY COLUMN tipo ENUM('upload', 'edicao', 'movimentacao', 'substituicao', 'lixeira', 'restauracao', 'exclusao_definitiva', 'pasta_criacao', 'pasta_renomeacao', 'pasta_lixeira') NOT NULL;
