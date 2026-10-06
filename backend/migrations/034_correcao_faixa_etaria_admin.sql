ALTER TABLE usuarios
  MODIFY COLUMN faixa_etaria_origem ENUM('cadastro','coleta_obrigatoria','perfil','admin') NULL;
