function criarUsuarioController(service) {
  async function listar(req, res) {
    res.status(200).json(await service.listarUsuarios(req.query));
  }

  async function criar(req, res) { res.status(201).json({ usuario: await service.criarUsuario(req.usuario, req.body) }); }
  async function editar(req, res) { res.status(200).json({ usuario: await service.editarUsuario(req.usuario, req.params.usuarioId, req.body) }); }
  async function iniciarRedefinicao(req, res) { res.status(200).json(await service.iniciarRedefinicao(req.usuario, req.params.usuarioId, req.body)); }

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
    criar: criar,
    editar: editar,
    alterarAtivo: alterarAtivo,
    alterarPapel: alterarPapel,
    iniciarRedefinicao: iniciarRedefinicao
  };
}

module.exports = criarUsuarioController;

