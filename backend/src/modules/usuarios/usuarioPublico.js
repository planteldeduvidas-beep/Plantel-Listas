function criarUsuarioPublico(usuario) {
  return {
    id: usuario.id,
    email: usuario.email,
    papel: usuario.papel,
    ativo: usuario.ativo
  };
}

module.exports = criarUsuarioPublico;

