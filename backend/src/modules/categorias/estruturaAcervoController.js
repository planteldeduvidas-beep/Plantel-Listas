function criarEstruturaAcervoController(service) {
  function responderLista(nome, operacao) {
    return async function executarLista(req, res, next) {
      try {
        const registros = await operacao();
        res.status(200).json({ [nome]: registros });
      } catch (erro) {
        next(erro);
      }
    };
  }

  function responderCriacao(nome, operacao) {
    return async function executarCriacao(req, res, next) {
      try {
        const registro = await operacao(req.body);
        res.status(201).json({ [nome]: registro });
      } catch (erro) {
        next(erro);
      }
    };
  }

  function responderEdicao(nome, operacao) {
    return async function executarEdicao(req, res, next) {
      try {
        const registro = await operacao(req.params.id, req.body);
        res.status(200).json({ [nome]: registro });
      } catch (erro) {
        next(erro);
      }
    };
  }

  async function listarPublica(req, res, next) {
    try {
      const estrutura = await service.listarPublica();
      res.status(200).json({ estrutura: estrutura });
    } catch (erro) {
      next(erro);
    }
  }

  return {
    listarPublica: listarPublica,
    categorias: {
      listar: responderLista("categorias", service.listarCategorias),
      criar: responderCriacao("categoria", service.criarCategoria),
      editar: responderEdicao("categoria", service.editarCategoria),
      alterarAtivo: responderEdicao("categoria", service.alterarCategoriaAtivo)
    },
    disciplinas: {
      listar: responderLista("disciplinas", service.disciplinas.listar),
      criar: responderCriacao("disciplina", service.disciplinas.criar),
      editar: responderEdicao("disciplina", service.disciplinas.editar),
      alterarAtivo: responderEdicao("disciplina", service.disciplinas.alterarAtivo)
    },
    concursos: {
      listar: responderLista("concursos", service.concursos.listar),
      criar: responderCriacao("concurso", service.concursos.criar),
      editar: responderEdicao("concurso", service.concursos.editar),
      alterarAtivo: responderEdicao("concurso", service.concursos.alterarAtivo)
    }
  };
}

module.exports = criarEstruturaAcervoController;
