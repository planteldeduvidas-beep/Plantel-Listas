ALTER TABLE categorias
  ADD COLUMN disciplina_id BIGINT UNSIGNED NULL AFTER drive_pasta_id,
  ADD COLUMN concurso_id BIGINT UNSIGNED NULL AFTER disciplina_id,
  ADD COLUMN classificacao_origem ENUM('nao_classificada', 'automatica', 'manual')
    NOT NULL DEFAULT 'nao_classificada' AFTER concurso_id,
  ADD KEY idx_categorias_disciplina_ativo (disciplina_id, ativo),
  ADD KEY idx_categorias_concurso_ativo (concurso_id, ativo),
  ADD CONSTRAINT fk_categorias_disciplina
    FOREIGN KEY (disciplina_id) REFERENCES disciplinas(id)
    ON UPDATE RESTRICT ON DELETE SET NULL,
  ADD CONSTRAINT fk_categorias_concurso
    FOREIGN KEY (concurso_id) REFERENCES concursos(id)
    ON UPDATE RESTRICT ON DELETE SET NULL;

ALTER TABLE materiais
  ADD FULLTEXT KEY ftx_materiais_nome (nome),
  ADD KEY idx_materiais_disponivel_nome (disponivel, nome),
  ADD KEY idx_materiais_categoria_tipo_nome (categoria_id, tipo, nome);

INSERT INTO disciplinas (nome, descricao)
VALUES
  ('Física', 'Conteúdos de Física.'),
  ('Geografia', 'Conteúdos de Geografia.'),
  ('História', 'Conteúdos de História.'),
  ('Inglês', 'Conteúdos de Inglês.'),
  ('Matemática', 'Conteúdos de Matemática.'),
  ('Português', 'Conteúdos de Português.'),
  ('Química', 'Conteúdos de Química.')
AS nova
ON DUPLICATE KEY UPDATE nome = nova.nome;

INSERT INTO concursos (nome, descricao)
VALUES
  ('AFA', 'Provas e materiais da AFA.'),
  ('APMBB', 'Provas e materiais da Academia de Polícia Militar do Barro Branco.'),
  ('ASON', 'Provas e materiais da ASON.'),
  ('CFN', 'Provas e materiais do Corpo de Fuzileiros Navais.'),
  ('CFO CBMERJ', 'Provas e materiais do CFO CBMERJ.'),
  ('Colégio Naval', 'Provas e materiais do Colégio Naval.'),
  ('EAGS', 'Provas e materiais do EAGS.'),
  ('EAM', 'Provas e materiais da Escola de Aprendizes-Marinheiros.'),
  ('EEAr', 'Provas e materiais da Escola de Especialistas de Aeronáutica.'),
  ('EFOMM', 'Provas e materiais da EFOMM.'),
  ('Escola Naval', 'Provas e materiais da Escola Naval.'),
  ('EPCAr', 'Provas e materiais da EPCAr.'),
  ('ESA', 'Provas e materiais da ESA.'),
  ('ESFCEx', 'Provas e materiais da ESFCEx.'),
  ('EsPCEx', 'Provas e materiais da EsPCEx.'),
  ('IME', 'Provas e materiais do IME.'),
  ('ITA', 'Provas e materiais do ITA.'),
  ('SDPM-SP', 'Provas e materiais da SDPM-SP.')
AS nova
ON DUPLICATE KEY UPDATE nome = nova.nome;

UPDATE categorias categoria
INNER JOIN disciplinas disciplina ON disciplina.nome = CASE
  WHEN categoria.nome IN ('Física em geral', 'Física IME', 'Revisões de física', 'OFICINA DE FÍSICA(JP)') THEN 'Física'
  WHEN categoria.nome = 'Geografia' THEN 'Geografia'
  WHEN categoria.nome = 'História' THEN 'História'
  WHEN categoria.nome = 'Inglês' THEN 'Inglês'
  WHEN categoria.nome IN ('Matemática em geral', 'Revisões de matemática') THEN 'Matemática'
  WHEN categoria.nome = 'Português' THEN 'Português'
  WHEN categoria.nome IN ('Química em geral', 'Química IME', 'Química por assunto') THEN 'Química'
  ELSE NULL
END
SET categoria.disciplina_id = disciplina.id,
    categoria.classificacao_origem = 'automatica'
WHERE categoria.disciplina_id IS NULL;

UPDATE categorias categoria
INNER JOIN categorias raiz ON raiz.id = categoria.categoria_pai_id
INNER JOIN concursos concurso ON concurso.nome = CASE categoria.nome
  WHEN 'AFA - Provas Anteriores' THEN 'AFA'
  WHEN 'APMBB (Barro Branco) - Provas Anteriores' THEN 'APMBB'
  WHEN 'ASON - Provas Anteriores' THEN 'ASON'
  WHEN 'CFN - Provas Anteriores' THEN 'CFN'
  WHEN 'CFO - CBMERJ - Provas Anteriores' THEN 'CFO CBMERJ'
  WHEN 'CN (Colégio Naval) - Provas anteriores' THEN 'Colégio Naval'
  WHEN 'EAGS - Provas Anteriores' THEN 'EAGS'
  WHEN 'EAM - Provas Anteriores' THEN 'EAM'
  WHEN 'EEAr - Provas Anteriores' THEN 'EEAr'
  WHEN 'EFOMM - Provas Anteriores' THEN 'EFOMM'
  WHEN 'EN (Escola Naval) - Provas Anteriores' THEN 'Escola Naval'
  WHEN 'EPCAr - Provas Anteriores' THEN 'EPCAr'
  WHEN 'ESA - Provas Anteriores' THEN 'ESA'
  WHEN 'ESFCEX - Provas Anteriores' THEN 'ESFCEx'
  WHEN 'EsPCEx - Provas Anteriores' THEN 'EsPCEx'
  WHEN 'IME - Provas Antigas' THEN 'IME'
  WHEN 'ITA - Provas Anteriores' THEN 'ITA'
  WHEN 'SDPM-SP - Provas Anteriores' THEN 'SDPM-SP'
  ELSE NULL
END
SET categoria.concurso_id = concurso.id,
    categoria.classificacao_origem = 'automatica'
WHERE raiz.nome = 'PROVAS ANTIGAS' AND categoria.concurso_id IS NULL;

CREATE TABLE estado_changes_google_drive (
  id TINYINT UNSIGNED NOT NULL,
  page_token VARCHAR(2048) NOT NULL,
  atualizado_em DATETIME(3) NOT NULL,
  ultima_verificacao_em DATETIME(3) NULL,
  ultimo_erro_codigo VARCHAR(100) NULL,
  PRIMARY KEY (id),
  CONSTRAINT chk_estado_changes_google_drive_unico CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE canais_google_drive (
  channel_id CHAR(36) NOT NULL,
  resource_id VARCHAR(255) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expira_em DATETIME(3) NOT NULL,
  status ENUM('ativo', 'substituido', 'expirado', 'encerrado') NOT NULL DEFAULT 'ativo',
  criado_em DATETIME(3) NOT NULL,
  atualizado_em TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (channel_id),
  KEY idx_canais_drive_status_expiracao (status, expira_em),
  KEY idx_canais_drive_resource_id (resource_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notificacoes_google_drive (
  channel_id CHAR(36) NOT NULL,
  message_number VARCHAR(40) NOT NULL,
  resource_state VARCHAR(40) NOT NULL,
  recebida_em DATETIME(3) NOT NULL,
  processada_em DATETIME(3) NULL,
  PRIMARY KEY (channel_id, message_number),
  CONSTRAINT fk_notificacoes_drive_canal FOREIGN KEY (channel_id)
    REFERENCES canais_google_drive(channel_id)
    ON UPDATE RESTRICT ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
