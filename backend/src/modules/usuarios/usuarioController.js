function criarUsuarioController(service, faixaEtariaService) {
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
    solicitarConfirmacaoEmLote: async (req,res) => res.json(await service.solicitarConfirmacaoEmLote(req.usuario,req.body)),
    obterFaixaEtaria: async (req,res) => res.json(await faixaEtariaService.obterParaAdmin(req.usuario,req.params.usuarioId)),
    corrigirFaixaEtaria: async (req,res) => res.json(await faixaEtariaService.corrigirComoAdmin(req.usuario,req.params.usuarioId,req.body)),
    detalhes: async (req,res) => res.json({usuario:await service.obterDetalhes(req.params.usuarioId)}),
    excluir: async (req,res) => res.json(await service.excluirUsuario(req.usuario,req.params.usuarioId,req.body)),
    regularizar: async (req,res) => res.json(await service.solicitarRegularizacao(req.usuario,req.params.usuarioId,req.body)),
    verificar: async (req,res) => res.json(await service.enviarVerificacao(req.usuario,req.params.usuarioId,req.body)),
    listar: listar,
    criar: criar,
    editar: editar,
    alterarAtivo: alterarAtivo,
    alterarPapel: alterarPapel,
    iniciarRedefinicao: iniciarRedefinicao
  };
}

module.exports = criarUsuarioController;

