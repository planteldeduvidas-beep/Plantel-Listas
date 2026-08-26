const AppError = require("../../shared/errors/AppError");
const {
  validarId,
  validarCategoria,
  validarClassificacao,
  validarAtivo
} = require("./estruturaAcervoValidator");

function criarArvore(categorias) {
  const porId = new Map();
  const raizes = [];

  categorias.forEach(function prepararCategoria(categoria) {
    porId.set(categoria.id, Object.assign({}, categoria, { filhas: [] }));
  });

  porId.forEach(function relacionarCategoria(categoria) {
    if (categoria.categoriaPaiId && porId.has(categoria.categoriaPaiId)) {
      porId.get(categoria.categoriaPaiId).filhas.push(categoria);
      return;
    }

    if (!categoria.categoriaPaiId) {
      raizes.push(categoria);
    }
  });

  return raizes;
}

function criarEstruturaAcervoService(repository) {
  async function listarPublica() {
    const resultados = await Promise.all([
      repository.listarCategorias(true),
      repository.disciplinas.listar(true),
      repository.concursos.listar(true)
    ]);
    return {
      categorias: criarArvore(resultados[0]),
      disciplinas: resultados[1],
      concursos: resultados[2]
    };
  }

  async function listarCategorias() {
    return repository.listarCategorias(false);
  }

  async function exigirCategoria(categoriaId) {
    const id = validarId(categoriaId, "Categoria");
    const categoria = await repository.buscarCategoriaPorId(id);

    if (!categoria) {
      throw new AppError("Categoria nao encontrada", 404, "CATEGORIA_NAO_ENCONTRADA");
    }

    return categoria;
  }

  async function validarPai(categoriaPaiId, categoriaId) {
    if (categoriaPaiId === null) {
      return;
    }

    if (categoriaPaiId === categoriaId) {
      throw new AppError("Categoria nao pode ser pai de si mesma", 409, "HIERARQUIA_INVALIDA");
    }

    const pai = await exigirCategoria(categoriaPaiId);

    if (!pai.ativo) {
      throw new AppError("Categoria pai esta inativa", 409, "CATEGORIA_PAI_INATIVA");
    }

    if (categoriaId) {
      const idsDaSubarvore = await repository.listarIdsDaSubarvore(categoriaId);

      if (idsDaSubarvore.includes(categoriaPaiId)) {
        throw new AppError("Movimentacao criaria ciclo na hierarquia", 409, "CICLO_DE_CATEGORIA");
      }
    }
  }

  async function criarCategoria(corpo) {
    const dados = validarCategoria(corpo, false);
    await validarPai(dados.categoriaPaiId, null);
    return repository.criarCategoria(dados);
  }

  async function editarCategoria(categoriaId, corpo) {
    const categoria = await exigirCategoria(categoriaId);

    if (!categoria.ativo) {
      throw new AppError("Categoria inativa nao pode ser editada", 409, "CATEGORIA_INATIVA");
    }

    const alteracoes = validarCategoria(corpo, true);
    const dados = Object.assign({}, categoria, alteracoes);
    await validarPai(dados.categoriaPaiId, categoria.id);
    return repository.atualizarCategoria(categoria.id, dados);
  }

  async function alterarCategoriaAtivo(categoriaId, corpo) {
    const categoria = await exigirCategoria(categoriaId);
    const ativo = validarAtivo(corpo);

    if (ativo === categoria.ativo) {
      return categoria;
    }

    if (ativo) {
      await validarPai(categoria.categoriaPaiId, categoria.id);
    } else if (await repository.contarFilhosAtivos(categoria.id) > 0) {
      throw new AppError(
        "Desative as categorias filhas antes da categoria pai",
        409,
        "CATEGORIA_POSSUI_FILHAS_ATIVAS"
      );
    }

    return repository.atualizarCategoriaAtivo(categoria.id, ativo);
  }

  function criarServiceDeCatalogo(catalogo, nome, codigo) {
    async function exigirRegistro(idInformado) {
      const id = validarId(idInformado, nome);
      const registro = await catalogo.buscarPorId(id);

      if (!registro) {
        throw new AppError(nome + " nao encontrado", 404, codigo + "_NAO_ENCONTRADO");
      }

      return registro;
    }

    async function listar() {
      return catalogo.listar(false);
    }

    async function criar(corpo) {
      return catalogo.criar(validarClassificacao(corpo, false));
    }

    async function editar(idInformado, corpo) {
      const registro = await exigirRegistro(idInformado);

      if (!registro.ativo) {
        throw new AppError(nome + " inativo nao pode ser editado", 409, codigo + "_INATIVO");
      }

      const dados = Object.assign({}, registro, validarClassificacao(corpo, true));
      return catalogo.atualizar(registro.id, dados);
    }

    async function alterarAtivo(idInformado, corpo) {
      const registro = await exigirRegistro(idInformado);
      return catalogo.atualizarAtivo(registro.id, validarAtivo(corpo));
    }

    return {
      listar: listar,
      criar: criar,
      editar: editar,
      alterarAtivo: alterarAtivo
    };
  }

  return {
    listarPublica: listarPublica,
    listarCategorias: listarCategorias,
    criarCategoria: criarCategoria,
    editarCategoria: editarCategoria,
    alterarCategoriaAtivo: alterarCategoriaAtivo,
    disciplinas: criarServiceDeCatalogo(repository.disciplinas, "Disciplina", "DISCIPLINA"),
    concursos: criarServiceDeCatalogo(repository.concursos, "Concurso", "CONCURSO")
  };
}

module.exports = criarEstruturaAcervoService;
