-- Lembretes apenas informativos. Nao altera ativo, senha, sessao ou permissoes.
CREATE TABLE IF NOT EXISTS lembretes_email (
  usuario_id BIGINT UNSIGNED NOT NULL,
  email_identificado VARCHAR(254) NOT NULL,
  resolvido_em DATETIME(3) NULL,
  criado_em TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (usuario_id),
  CONSTRAINT fk_lembretes_email_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Contas indicadas pelo administrador; nenhuma conta e classificada como falsa.
-- Vincular ao endereco observado evita avisar apos uma troca administrativa.
INSERT IGNORE INTO lembretes_email (usuario_id, email_identificado)
SELECT u.id, u.email FROM usuarios u
WHERE u.id IN (5, 11, 59, 78, 26)
  AND NOT EXISTS (
    SELECT 1 FROM confirmacoes_email c
    WHERE c.usuario_id=u.id AND c.email_destino=u.email
      AND c.usada_em IS NOT NULL AND c.cancelada_em IS NULL
  );
