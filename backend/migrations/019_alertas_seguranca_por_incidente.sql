CREATE TABLE seguranca_alerta_cotas (
  severidade VARCHAR(8) NOT NULL PRIMARY KEY,
  janela_ms BIGINT UNSIGNED NOT NULL DEFAULT 0,
  quantidade INT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO seguranca_alerta_cotas (severidade) VALUES ('HIGH'), ('CRITICAL');

CREATE TABLE seguranca_alerta_incidentes (
  chave CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  expira_ms BIGINT UNSIGNED NOT NULL,
  KEY idx_seguranca_alerta_expira (expira_ms)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
