CREATE TABLE estados_oauth_google_drive (
  estado_hash CHAR(64) NOT NULL,
  usuario_id BIGINT UNSIGNED NOT NULL,
  expira_em DATETIME(3) NOT NULL,
  consumido_em DATETIME(3) NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (estado_hash),
  KEY idx_estados_oauth_drive_expiracao (expira_em, consumido_em),
  CONSTRAINT fk_estados_oauth_drive_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    ON UPDATE RESTRICT ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE credenciais_google_drive (
  id TINYINT UNSIGNED NOT NULL,
  refresh_token_criptografado TEXT NOT NULL,
  escopo VARCHAR(255) NOT NULL,
  autorizado_por_usuario_id BIGINT UNSIGNED NOT NULL,
  autorizado_em DATETIME(3) NOT NULL,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT chk_credenciais_google_drive_unica CHECK (id = 1),
  CONSTRAINT fk_credenciais_google_drive_usuario
    FOREIGN KEY (autorizado_por_usuario_id) REFERENCES usuarios(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sincronizacoes_google_drive (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  iniciado_por_usuario_id BIGINT UNSIGNED NOT NULL,
  status ENUM('em_andamento', 'concluida', 'falhou') NOT NULL,
  pastas_encontradas INT UNSIGNED NOT NULL DEFAULT 0,
  arquivos_encontrados INT UNSIGNED NOT NULL DEFAULT 0,
  materiais_criados INT UNSIGNED NOT NULL DEFAULT 0,
  materiais_atualizados INT UNSIGNED NOT NULL DEFAULT 0,
  itens_indisponiveis INT UNSIGNED NOT NULL DEFAULT 0,
  erro_codigo VARCHAR(100) NULL,
  iniciada_em DATETIME(3) NOT NULL,
  concluida_em DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_sincronizacoes_drive_status_data (status, iniciada_em),
  KEY idx_sincronizacoes_drive_usuario (iniciado_por_usuario_id),
  CONSTRAINT fk_sincronizacoes_drive_usuario
    FOREIGN KEY (iniciado_por_usuario_id) REFERENCES usuarios(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE categorias
  ADD COLUMN drive_pasta_id VARCHAR(255) NULL AFTER categoria_pai_id,
  ADD COLUMN ultima_sincronizacao_drive_id BIGINT UNSIGNED NULL AFTER ativo,
  ADD UNIQUE KEY uq_categorias_drive_pasta_id (drive_pasta_id),
  ADD KEY idx_categorias_ultima_sincronizacao_drive (ultima_sincronizacao_drive_id),
  ADD CONSTRAINT fk_categorias_ultima_sincronizacao_drive
    FOREIGN KEY (ultima_sincronizacao_drive_id) REFERENCES sincronizacoes_google_drive(id)
    ON UPDATE RESTRICT ON DELETE SET NULL;

CREATE TABLE materiais (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  drive_file_id VARCHAR(255) NOT NULL,
  drive_parent_file_id VARCHAR(255) NULL,
  categoria_id BIGINT UNSIGNED NULL,
  disciplina_id BIGINT UNSIGNED NULL,
  concurso_id BIGINT UNSIGNED NULL,
  nome VARCHAR(500) NOT NULL,
  mime_type VARCHAR(255) NOT NULL,
  tipo ENUM('pdf', 'video', 'outro') NOT NULL,
  extensao VARCHAR(30) NULL,
  tamanho_bytes BIGINT UNSIGNED NULL,
  checksum_md5 VARCHAR(64) NULL,
  drive_criado_em DATETIME(3) NULL,
  drive_modificado_em DATETIME(3) NULL,
  web_view_link VARCHAR(1000) NULL,
  resource_key VARCHAR(255) NULL,
  disponivel TINYINT(1) NOT NULL DEFAULT 1,
  ultima_sincronizacao_drive_id BIGINT UNSIGNED NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_materiais_drive_file_id (drive_file_id),
  KEY idx_materiais_categoria_disponivel (categoria_id, disponivel),
  KEY idx_materiais_disciplina (disciplina_id),
  KEY idx_materiais_concurso (concurso_id),
  KEY idx_materiais_tipo_disponivel (tipo, disponivel),
  KEY idx_materiais_ultima_sincronizacao (ultima_sincronizacao_drive_id),
  CONSTRAINT fk_materiais_categoria
    FOREIGN KEY (categoria_id) REFERENCES categorias(id)
    ON UPDATE RESTRICT ON DELETE SET NULL,
  CONSTRAINT fk_materiais_disciplina
    FOREIGN KEY (disciplina_id) REFERENCES disciplinas(id)
    ON UPDATE RESTRICT ON DELETE SET NULL,
  CONSTRAINT fk_materiais_concurso
    FOREIGN KEY (concurso_id) REFERENCES concursos(id)
    ON UPDATE RESTRICT ON DELETE SET NULL,
  CONSTRAINT fk_materiais_ultima_sincronizacao
    FOREIGN KEY (ultima_sincronizacao_drive_id) REFERENCES sincronizacoes_google_drive(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_materiais_tamanho CHECK (tamanho_bytes IS NULL OR tamanho_bytes >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
