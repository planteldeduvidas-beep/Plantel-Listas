ALTER TABLE usuarios
  ADD COLUMN nome VARCHAR(120) NOT NULL DEFAULT 'Usuario' AFTER id;

UPDATE usuarios
SET nome = LEFT(
  TRIM(REPLACE(REPLACE(SUBSTRING_INDEX(email, '@', 1), '.', ' '), '_', ' ')),
  120
)
WHERE nome = 'Usuario';

CREATE TABLE historico_materiais_usuario (
  usuario_id BIGINT UNSIGNED NOT NULL,
  material_id BIGINT UNSIGNED NOT NULL,
  ultima_acao ENUM('visualizacao', 'download') NOT NULL,
  ultima_visualizacao_em DATETIME(3) NULL,
  ultimo_download_em DATETIME(3) NULL,
  atualizado_em DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (usuario_id, material_id),
  KEY idx_historico_usuario_atualizado (usuario_id, atualizado_em DESC, material_id),
  CONSTRAINT fk_historico_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT fk_historico_material FOREIGN KEY (material_id)
    REFERENCES materiais(id) ON UPDATE RESTRICT ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE analytics_resumo_diario (
  dia DATE NOT NULL,
  acessos BIGINT UNSIGNED NOT NULL DEFAULT 0,
  visualizacoes BIGINT UNSIGNED NOT NULL DEFAULT 0,
  downloads BIGINT UNSIGNED NOT NULL DEFAULT 0,
  alunos_ativos BIGINT UNSIGNED NOT NULL DEFAULT 0,
  atualizado_em TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (dia)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE analytics_materiais_diario (
  dia DATE NOT NULL,
  material_id BIGINT UNSIGNED NOT NULL,
  material_nome VARCHAR(255) NOT NULL,
  visualizacoes BIGINT UNSIGNED NOT NULL DEFAULT 0,
  downloads BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (dia, material_id),
  KEY idx_analytics_materiais_periodo (material_id, dia)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE analytics_buscas_diario (
  dia DATE NOT NULL,
  termo_busca VARCHAR(120) NOT NULL,
  quantidade BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (dia, termo_busca),
  KEY idx_analytics_buscas_periodo (termo_busca, dia)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE analytics_pastas_diario (
  dia DATE NOT NULL,
  pasta_chave VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  pasta_nome VARCHAR(255) NOT NULL,
  quantidade BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (dia, pasta_chave),
  KEY idx_analytics_pastas_periodo (pasta_chave, dia)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
