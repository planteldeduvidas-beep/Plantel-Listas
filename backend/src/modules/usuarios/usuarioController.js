function criarUsuarioController(service) {
  async function listar(req, res) {
    const usuarios = await service.listarUsuarios();
    res.status(200).json({ usuarios: usuarios });
  }

  async function alterarAtivo(req, res) {
    const usuario = await service.alterarAtivo(
      req.usuario,
      req.params.usuarioId,
      req.body
    );
    res.status(200).json({ usuario: usuario });
  }

  async function alterarPapel(req, res) {
    const usuario = await service.alterarPapel(
      req.usuario,
      req.params.usuarioId,
      req.body
    );
    res.status(200).json({ usuario: usuario });
  }

  return {
    listar: listar,
    alterarAtivo: alterarAtivo,
    alterarPapel: alterarPapel
  };
}

module.exports = criarUsuarioController;

