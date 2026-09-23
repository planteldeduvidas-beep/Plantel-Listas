function criarParceiroController(service) {
  function executar(operacao) {
    return async function responder(req, res, next) {
      try { await operacao(req, res); } catch (erro) { next(erro); }
    };
  }

  return {
    listar: executar(async (req, res) => res.json({ parceiros: await service.listar(true) })),
    listarAdmin: executar(async (req, res) => res.json({ parceiros: await service.listar(false) })),
    criar: executar(async (req, res) => res.status(201).json({ parceiro: await service.criar(req.body, req.usuario.id) })),
    editar: executar(async (req, res) => res.json({ parceiro: await service.editar(req.params.id, req.body, req.usuario.id) })),
    alterarImagem: executar(async (req, res) => res.json({ parceiro: await service.alterarImagem(req.params.id, req.file, req.usuario.id) })),
    removerImagem: executar(async (req, res) => res.json({ parceiro: await service.removerImagem(req.params.id, req.usuario.id) })),
    obterImagem: executar(async (req, res) => {
      const imagem = await service.obterImagem(req.params.id, req.usuario);
      res.set("X-Content-Type-Options", "nosniff");
      res.type(imagem.mime).send(imagem.dados);
    })
  };
}

module.exports = criarParceiroController;
