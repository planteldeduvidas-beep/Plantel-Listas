ALTER TABLE categorias
  ADD COLUMN disciplina_estado ENUM('herdar', 'definida', 'nao_se_aplica')
    NOT NULL DEFAULT 'herdar' AFTER disciplina_id,
  ADD COLUMN disciplina_origem ENUM('automatica', 'manual') NULL AFTER disciplina_estado,
  ADD COLUMN disciplina_regra_codigo VARCHAR(100) NULL AFTER disciplina_origem,
  ADD COLUMN concurso_estado ENUM('herdar', 'definida', 'nao_se_aplica')
    NOT NULL DEFAULT 'herdar' AFTER concurso_id,
  ADD COLUMN concurso_origem ENUM('automatica', 'manual') NULL AFTER concurso_estado,
  ADD COLUMN concurso_regra_codigo VARCHAR(100) NULL AFTER concurso_origem,
  ADD KEY idx_categorias_disciplina_estado (disciplina_estado, ativo),
  ADD KEY idx_categorias_concurso_estado (concurso_estado, ativo);

UPDATE categorias
SET disciplina_estado = IF(disciplina_id IS NULL, 'herdar', 'definida'),
    disciplina_origem = IF(disciplina_id IS NULL, NULL, IF(classificacao_origem = 'manual', 'manual', 'automatica')),
    concurso_estado = IF(concurso_id IS NULL, 'herdar', 'definida'),
    concurso_origem = IF(concurso_id IS NULL, NULL, IF(classificacao_origem = 'manual', 'manual', 'automatica'));

CREATE TABLE auditoria_classificacao_categorias (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  categoria_id BIGINT UNSIGNED NOT NULL,
  dimensao ENUM('disciplina', 'concurso') NOT NULL,
  estado_anterior ENUM('herdar', 'definida', 'nao_se_aplica') NOT NULL,
  referencia_anterior_id BIGINT UNSIGNED NULL,
  estado_novo ENUM('herdar', 'definida', 'nao_se_aplica') NOT NULL,
  referencia_nova_id BIGINT UNSIGNED NULL,
  origem ENUM('automatica', 'manual') NOT NULL,
  regra_codigo VARCHAR(100) NULL,
  usuario_id BIGINT UNSIGNED NULL,
  criado_em TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_auditoria_classificacao_categoria (categoria_id, criado_em),
  KEY idx_auditoria_classificacao_regra (regra_codigo, criado_em),
  CONSTRAINT fk_auditoria_classificacao_categoria FOREIGN KEY (categoria_id)
    REFERENCES categorias(id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT fk_auditoria_classificacao_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON UPDATE RESTRICT ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO disciplinas (nome, descricao)
VALUES ('Biologia', 'Conteudos de Biologia.') AS nova
ON DUPLICATE KEY UPDATE nome = nova.nome;
