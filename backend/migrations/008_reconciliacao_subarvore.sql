ALTER TABLE canais_google_drive
  MODIFY COLUMN resource_id VARCHAR(255) NULL,
  MODIFY COLUMN status ENUM('preparando', 'ativo', 'substituido', 'expirado', 'encerrado')
    NOT NULL DEFAULT 'preparando';
