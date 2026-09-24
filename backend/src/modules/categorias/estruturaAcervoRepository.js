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

  async function buscarCategoriaPorId(categoriaId, executorInformado, bloquear) {
    const executor = executorInformado || pool;
    const [registros] = await executor.execute(
      "SELECT id, nome, descricao, categoria_pai_id, ordem, ativo, criado_em, atualizado_em "
      + "FROM categorias WHERE id = ? LIMIT 1" + (bloquear ? " FOR UPDATE" : ""),
      [categoriaId]
    );
    return mapearCategoria(registros[0]);
  }

  async function criarCategoria(dados, executorInformado) {
    const executor = executorInformado || pool;
    try {
      const [resultado] = await executor.execute(
        "INSERT INTO categorias (nome, descricao, categoria_pai_id, ordem) VALUES (?, ?, ?, ?)",
        [dados.nome, dados.descricao, dados.categoriaPaiId, dados.ordem]
      );
      return buscarCategoriaPorId(resultado.insertId,executor);
    } catch (erro) {
      converterDuplicidade(erro, "Categoria");
    }
  }

  async function atualizarCategoria(categoriaId, dados, executorInformado) {
    const executor = executorInformado || pool;
    try {
      await executor.execute(
        "UPDATE categorias SET nome = ?, descricao = ?, categoria_pai_id = ?, ordem = ? WHERE id = ?",
        [dados.nome, dados.descricao, dados.categoriaPaiId, dados.ordem, categoriaId]
      );
      return buscarCategoriaPorId(categoriaId,executor);
    } catch (erro) {
      converterDuplicidade(erro, "Categoria");
    }
  }

  async function atualizarCategoriaAtivo(categoriaId, ativo, executorInformado) {
    const executor = executorInformado || pool;
    await executor.execute(
      "UPDATE categorias SET ativo = ? WHERE id = ?",
      [ativo ? 1 : 0, categoriaId]
    );
    return buscarCategoriaPorId(categoriaId,executor);
  }

  async function contarFilhosAtivos(categoriaId, executorInformado) {
    const executor = executorInformado || pool;
    const [registros] = await executor.execute(
      "SELECT COUNT(*) AS quantidade FROM categorias WHERE categoria_pai_id = ? AND ativo = 1",
      [categoriaId]
    );
    return Number(registros[0].quantidade);
  }

  async function listarIdsDaSubarvore(categoriaId, executorInformado) {
    const executor = executorInformado || pool;
    const [registros] = await executor.execute(
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

  async function ehCategoriaVinculadaAoDrive(categoriaId, executorInformado) {
    const executor = executorInformado || pool;
    const [registros] = await executor.execute(
      "SELECT drive_pasta_id IS NOT NULL AS vinculada FROM categorias WHERE id=? LIMIT 1",
      [categoriaId]
    );
    return Boolean(registros[0] && Number(registros[0].vinculada) === 1);
  }

  async function comTransacaoHierarquia(funcao) {
    const conexao=await pool.getConnection();let travaObtida=false;
    try{
      const [travas]=await conexao.execute("SELECT GET_LOCK(LEFT(CONCAT('plantel_hierarquia_',DATABASE()),64),5) AS obtida");
      if(Number(travas[0].obtida)!==1)throw new AppError("Outra alteracao da hierarquia esta em andamento",409,"HIERARQUIA_CONCORRENTE");
      travaObtida=true;await conexao.beginTransaction();
      await conexao.execute("SELECT id FROM categorias ORDER BY id FOR UPDATE");
      try{const resultado=await funcao(conexao);await conexao.commit();return resultado;}
      catch(erro){await conexao.rollback().catch(function preservar(){});throw erro;}
    }finally{
      if(travaObtida)await conexao.execute("SELECT RELEASE_LOCK(LEFT(CONCAT('plantel_hierarquia_',DATABASE()),64))").catch(function ignorar(){});
      conexao.release();
    }
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
    ehCategoriaVinculadaAoDrive: ehCategoriaVinculadaAoDrive,
    criarCategoria: criarCategoria,
    atualizarCategoria: atualizarCategoria,
    atualizarCategoriaAtivo: atualizarCategoriaAtivo,
    contarFilhosAtivos: contarFilhosAtivos,
    listarIdsDaSubarvore: listarIdsDaSubarvore,
    comTransacaoHierarquia: comTransacaoHierarquia,
    disciplinas: criarCatalogo("disciplinas", "Disciplina"),
    concursos: criarCatalogo("concursos", "Concurso")
  };
}

module.exports = criarEstruturaAcervoRepository;
