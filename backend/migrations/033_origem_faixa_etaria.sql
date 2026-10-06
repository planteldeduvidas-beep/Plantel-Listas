ALTER TABLE usuarios
  ADD COLUMN faixa_etaria_origem ENUM('cadastro','coleta_obrigatoria','perfil') NULL;
