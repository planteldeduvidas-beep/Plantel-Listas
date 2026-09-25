CREATE TABLE seguranca_agregados (
  sujeito CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  escopo VARCHAR(16) NOT NULL,
  janela_ms BIGINT UNSIGNED NOT NULL,
  ultimo_ms BIGINT UNSIGNED NOT NULL,
  pontos INT UNSIGNED NOT NULL DEFAULT 0,
  quantidade INT UNSIGNED NOT NULL DEFAULT 0,
  recursos JSON NOT NULL,
  limitar_ate_ms BIGINT UNSIGNED NOT NULL DEFAULT 0,
  bloquear_ate_ms BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (sujeito, escopo),
  KEY idx_seguranca_expiracao (bloquear_ate_ms),
  KEY idx_seguranca_limite (limitar_ate_ms),
  KEY idx_seguranca_ultimo (ultimo_ms)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE seguranca_eventos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  criado_em TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  sujeito CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  tipo VARCHAR(40) NOT NULL,
  severidade VARCHAR(8) NOT NULL,
  evidencia TEXT NOT NULL,
  assinatura CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (id),
  KEY idx_seguranca_eventos_origem (sujeito, id),
  KEY idx_seguranca_eventos_retencao (criado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE seguranca_controle (
  id TINYINT UNSIGNED NOT NULL,
  contencao TINYINT(1) NOT NULL DEFAULT 0,
  proximo_alerta_ms BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  CONSTRAINT chk_seguranca_contencao CHECK (contencao IN (0,1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO seguranca_controle (id) VALUES (1);
