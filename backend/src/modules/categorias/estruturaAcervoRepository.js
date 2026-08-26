const AppError = require("../../shared/errors/AppError");

function mapearCategoria(registro) {
  if (!registro) {
    return null;
  }

  return {
    id: registro.id,
    nome: registro.nome,
    descricao: registro.descricao,
    categoriaPaiId: registro.categoria_pai_id,
    ordem: registro.ordem,
    ativo: registro.ativo === 1,
    criadoEm: registro.criado_em,
    atualizadoEm: registro.atualizado_em
  };
}

function mapearClassificacao(registro) {
  if (!registro) {
    return null;
  }

  return {
    id: registro.id,
    nome: registro.nome,
    descricao: registro.descricao,
    ativo: registro.ativo === 1,
    criadoEm: registro.criado_em,
    atualizadoEm: registro.atualizado_em
  };
}

function converterDuplicidade(erro, entidade) {
  if (erro && erro.code === "ER_DUP_ENTRY") {
    throw new AppError(entidade + " ja existente", 409, "REGISTRO_DUPLICADO");
  }

  throw erro;
}

function criarEstruturaAcervoRepository(pool) {
  async function listarCategorias(apenasAtivas) {
    const condicao = apenasAtivas ? "WHERE ativo = 1 " : "";
    const [registros] = await pool.execute(
      "SELECT id, nome, descricao, categoria_pai_id, ordem, ativo, criado_em, atualizado_em "
      + "FROM categorias " + condicao
      + "ORDER BY categoria_pai_chave ASC, ordem ASC, nome ASC, id ASC"
    );
    return registros.map(mapearCategoria);
  }

  async function buscarCategoriaPorId(categoriaId) {
    const [registros] = await pool.execute(
      "SELECT id, nome, descricao, categoria_pai_id, ordem, ativo, criado_em, atualizado_em "
      + "FROM categorias WHERE id = ? LIMIT 1",
      [categoriaId]
    );
    return mapearCategoria(registros[0]);
  }

  async function criarCategoria(dados) {
    try {
      const [resultado] = await pool.execute(
        "INSERT INTO categorias (nome, descricao, categoria_pai_id, ordem) VALUES (?, ?, ?, ?)",
        [dados.nome, dados.descricao, dados.categoriaPaiId, dados.ordem]
      );
      return buscarCategoriaPorId(resultado.insertId);
    } catch (erro) {
      converterDuplicidade(erro, "Categoria");
    }
  }

  async function atualizarCategoria(categoriaId, dados) {
    try {
      await pool.execute(
        "UPDATE categorias SET nome = ?, descricao = ?, categoria_pai_id = ?, ordem = ? WHERE id = ?",
        [dados.nome, dados.descricao, dados.categoriaPaiId, dados.ordem, categoriaId]
      );
      return buscarCategoriaPorId(categoriaId);
    } catch (erro) {
      converterDuplicidade(erro, "Categoria");
    }
  }

  async function atualizarCategoriaAtivo(categoriaId, ativo) {
    await pool.execute(
      "UPDATE categorias SET ativo = ? WHERE id = ?",
      [ativo ? 1 : 0, categoriaId]
    );
    return buscarCategoriaPorId(categoriaId);
  }

  async function contarFilhosAtivos(categoriaId) {
    const [registros] = await pool.execute(
      "SELECT COUNT(*) AS quantidade FROM categorias WHERE categoria_pai_id = ? AND ativo = 1",
      [categoriaId]
    );
    return Number(registros[0].quantidade);
  }

  async function listarIdsDaSubarvore(categoriaId) {
    const [registros] = await pool.execute(
      "WITH RECURSIVE subarvore AS ("
      + "SELECT id FROM categorias WHERE id = ? "
      + "UNION ALL "
      + "SELECT categoria.id FROM categorias categoria "
      + "INNER JOIN subarvore pai ON categoria.categoria_pai_id = pai.id"
      + ") SELECT id FROM subarvore",
      [categoriaId]
    );
    return registros.map(function mapearId(registro) {
      return Number(registro.id);
    });
  }

  function criarCatalogo(tabela, entidade) {
    async function listar(apenasAtivos) {
      const condicao = apenasAtivos ? "WHERE ativo = 1 " : "";
      const [registros] = await pool.execute(
        "SELECT id, nome, descricao, ativo, criado_em, atualizado_em FROM "
        + tabela + " " + condicao + "ORDER BY nome ASC, id ASC"
      );
      return registros.map(mapearClassificacao);
    }

    async function buscarPorId(id) {
      const [registros] = await pool.execute(
        "SELECT id, nome, descricao, ativo, criado_em, atualizado_em FROM "
        + tabela + " WHERE id = ? LIMIT 1",
        [id]
      );
      return mapearClassificacao(registros[0]);
    }

    async function criar(dados) {
      try {
        const [resultado] = await pool.execute(
          "INSERT INTO " + tabela + " (nome, descricao) VALUES (?, ?)",
          [dados.nome, dados.descricao]
        );
        return buscarPorId(resultado.insertId);
      } catch (erro) {
        converterDuplicidade(erro, entidade);
      }
    }

    async function atualizar(id, dados) {
      try {
        await pool.execute(
          "UPDATE " + tabela + " SET nome = ?, descricao = ? WHERE id = ?",
          [dados.nome, dados.descricao, id]
        );
        return buscarPorId(id);
      } catch (erro) {
        converterDuplicidade(erro, entidade);
      }
    }

    async function atualizarAtivo(id, ativo) {
      await pool.execute(
        "UPDATE " + tabela + " SET ativo = ? WHERE id = ?",
        [ativo ? 1 : 0, id]
      );
      return buscarPorId(id);
    }

    return {
      listar: listar,
      buscarPorId: buscarPorId,
      criar: criar,
      atualizar: atualizar,
      atualizarAtivo: atualizarAtivo
    };
  }

  return {
    listarCategorias: listarCategorias,
    buscarCategoriaPorId: buscarCategoriaPorId,
    criarCategoria: criarCategoria,
    atualizarCategoria: atualizarCategoria,
    atualizarCategoriaAtivo: atualizarCategoriaAtivo,
    contarFilhosAtivos: contarFilhosAtivos,
    listarIdsDaSubarvore: listarIdsDaSubarvore,
    disciplinas: criarCatalogo("disciplinas", "Disciplina"),
    concursos: criarCatalogo("concursos", "Concurso")
  };
}

module.exports = criarEstruturaAcervoRepository;
