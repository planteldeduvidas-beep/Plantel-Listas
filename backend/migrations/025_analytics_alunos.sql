-- Aditiva: preserva eventos e totais historicos de todos os perfis.
-- NULL nos novos totais significa legado sem segmentacao, nunca zero alunos.
ALTER TABLE eventos_uso_acervo ADD COLUMN papel_no_evento ENUM('aluno','professor','admin') NULL;
ALTER TABLE analytics_resumo_diario
  ADD COLUMN navegacoes_alunos BIGINT UNSIGNED NULL,
  ADD COLUMN aberturas_alunos BIGINT UNSIGNED NULL,
  ADD COLUMN downloads_alunos BIGINT UNSIGNED NULL;
ALTER TABLE analytics_materiais_diario
  ADD COLUMN aberturas_alunos BIGINT UNSIGNED NULL,
  ADD COLUMN downloads_alunos BIGINT UNSIGNED NULL;
ALTER TABLE analytics_buscas_diario ADD COLUMN quantidade_alunos BIGINT UNSIGNED NULL;
ALTER TABLE analytics_pastas_diario ADD COLUMN quantidade_alunos BIGINT UNSIGNED NULL;
