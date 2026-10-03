-- Mutex transacional por email. Nao modifica nem deduplica usuarios existentes.
-- A chave unica serializa criacoes/edicoes equivalentes; o repository consulta
-- usuarios com leitura corrente sob essa trava antes de gravar.
CREATE TABLE IF NOT EXISTS usuarios_email_travas (
  email VARCHAR(254) NOT NULL,
  PRIMARY KEY (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
