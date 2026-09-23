CREATE TABLE parceiros_plantel (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome VARCHAR(120) NOT NULL,
  descricao VARCHAR(240) NOT NULL,
  url_externa VARCHAR(2048) NOT NULL,
  cupom VARCHAR(80) NULL,
  desconto VARCHAR(120) NULL,
  texto_botao VARCHAR(60) NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 0,
  ordem INT UNSIGNED NOT NULL DEFAULT 0,
  imagem_mime VARCHAR(20) NULL,
  imagem_dados MEDIUMBLOB NULL,
  imagem_atualizada_em TIMESTAMP(3) NULL,
  criado_em TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  atualizado_em TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_parceiros_ativos_ordem (ativo, ordem, id),
  CONSTRAINT chk_parceiros_ativo CHECK (ativo IN (0, 1)),
  CONSTRAINT chk_parceiros_imagem CHECK (
    (imagem_mime IS NULL AND imagem_dados IS NULL)
    OR (imagem_mime IS NOT NULL AND imagem_dados IS NOT NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
