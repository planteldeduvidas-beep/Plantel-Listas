function criarAvisoController(service) {
  function executar(operacao) {
    return async function responder(req, res, next) {
      try { await operacao(req, res); } catch (erro) { next(erro); }
    };
  }

  return {
    listar: executar(async (req, res) => res.json({ avisos: await service.listar(true) })),
    listarAdmin: executar(async (req, res) => res.json({ avisos: await service.listar(false) })),
    criar: executar(async (req, res) => res.status(201).json({ aviso: await service.criar(req.body, req.usuario.id) })),
    editar: executar(async (req, res) => res.json({ aviso: await service.editar(req.params.id, req.body, req.usuario.id) }))
  };
}

module.exports = criarAvisoController;
