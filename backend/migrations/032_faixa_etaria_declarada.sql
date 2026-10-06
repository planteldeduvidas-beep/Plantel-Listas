-- Aditiva, sem atribuir idade ou alterar o acesso de contas existentes.
ALTER TABLE usuarios
  ADD COLUMN faixa_etaria_declarada ENUM('menos_12','12_17','18_mais') NULL,
  ADD COLUMN faixa_etaria_declarada_em TIMESTAMP(3) NULL;
ALTER TABLE cadastros_publicos_pendentes
  ADD COLUMN faixa_etaria_declarada ENUM('menos_12','12_17','18_mais') NULL;
