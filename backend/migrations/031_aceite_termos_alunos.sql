-- Nenhum aceite retroativo: contas existentes continuam sem registro ate a escolha do aluno.
CREATE TABLE aceites_termos_alunos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  usuario_id BIGINT UNSIGNED NOT NULL,
  termos_versao VARCHAR(32) NOT NULL,
  privacidade_versao VARCHAR(32) NOT NULL,
  aceito_em TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  origem ENUM('cadastro','conta') NOT NULL,
  UNIQUE KEY uq_aceite_usuario_versoes(usuario_id,termos_versao,privacidade_versao),
  CONSTRAINT fk_aceite_usuario FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
ALTER TABLE cadastros_publicos_pendentes
  ADD COLUMN termos_versao VARCHAR(32) NULL,
  ADD COLUMN privacidade_versao VARCHAR(32) NULL,
  ADD COLUMN termos_aceitos_em TIMESTAMP(3) NULL;
