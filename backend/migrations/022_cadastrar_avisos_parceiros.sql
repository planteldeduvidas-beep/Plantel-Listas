-- Importacao unica dos parceiros existentes. Avisos ja cadastrados sao preservados.
-- O tamanho comporta nome, descricao, beneficio e cupom sem truncamento.
ALTER TABLE avisos_biblioteca MODIFY texto VARCHAR(600) NOT NULL;

INSERT INTO avisos_biblioteca (texto, url, ativo, ordem)
SELECT CONCAT_WS(' · ', p.nome, NULLIF(p.descricao, ''), NULLIF(p.desconto, ''),
                 CASE WHEN COALESCE(p.cupom, '') <> '' THEN CONCAT('Cupom: ', p.cupom) END),
       p.url_externa, p.ativo, p.ordem
FROM parceiros_plantel p
WHERE NOT EXISTS (
  SELECT 1 FROM avisos_biblioteca a WHERE BINARY a.url = BINARY p.url_externa
)
AND NOT EXISTS (
  SELECT 1 FROM parceiros_plantel anterior
  WHERE BINARY anterior.url_externa = BINARY p.url_externa AND anterior.id < p.id
);
