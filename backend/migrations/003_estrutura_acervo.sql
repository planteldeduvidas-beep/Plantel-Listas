CREATE TABLE categorias (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome VARCHAR(120) NOT NULL,
  descricao VARCHAR(500) NULL,
  categoria_pai_id BIGINT UNSIGNED NULL,
  categoria_pai_chave BIGINT UNSIGNED GENERATED ALWAYS AS (IFNULL(categoria_pai_id, 0)) STORED,
  ordem INT UNSIGNED NOT NULL DEFAULT 0,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  criado_em TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  atualizado_em TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_categorias_pai_nome (categoria_pai_chave, nome),
  KEY idx_categorias_pai_ordem (categoria_pai_id, ordem, nome),
  KEY idx_categorias_ativo (ativo),
  CONSTRAINT ck_categorias_ativo CHECK (ativo IN (0, 1)),
  CONSTRAINT fk_categorias_pai FOREIGN KEY (categoria_pai_id)
    REFERENCES categorias (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE disciplinas (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome VARCHAR(120) NOT NULL,
  descricao VARCHAR(500) NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  criado_em TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  atualizado_em TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_disciplinas_nome (nome),
  KEY idx_disciplinas_ativo_nome (ativo, nome),
  CONSTRAINT ck_disciplinas_ativo CHECK (ativo IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE concursos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome VARCHAR(120) NOT NULL,
  descricao VARCHAR(500) NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  criado_em TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  atualizado_em TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_concursos_nome (nome),
  KEY idx_concursos_ativo_nome (ativo, nome),
  CONSTRAINT ck_concursos_ativo CHECK (ativo IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE permissoes_professor_categoria (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  professor_id BIGINT UNSIGNED NOT NULL,
  categoria_id BIGINT UNSIGNED NOT NULL,
  concedida_por_usuario_id BIGINT UNSIGNED NOT NULL,
  revogada_por_usuario_id BIGINT UNSIGNED NULL,
  concedida_em TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  revogada_em TIMESTAMP(3) NULL,
  atualizado_em TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_permissoes_professor_categoria (professor_id, categoria_id),
  KEY idx_permissoes_categoria_ativa (categoria_id, revogada_em),
  KEY idx_permissoes_professor_ativa (professor_id, revogada_em),
  CONSTRAINT fk_permissoes_professor FOREIGN KEY (professor_id)
    REFERENCES usuarios (id) ON DELETE RESTRICT,
  CONSTRAINT fk_permissoes_categoria FOREIGN KEY (categoria_id)
    REFERENCES categorias (id) ON DELETE RESTRICT,
  CONSTRAINT fk_permissoes_concedida_por FOREIGN KEY (concedida_por_usuario_id)
    REFERENCES usuarios (id) ON DELETE RESTRICT,
  CONSTRAINT fk_permissoes_revogada_por FOREIGN KEY (revogada_por_usuario_id)
    REFERENCES usuarios (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
