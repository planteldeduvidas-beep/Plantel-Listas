function criarArvoreSql() {
  return "WITH RECURSIVE arvore AS ("
    + "SELECT c.id,c.nome,c.descricao,c.categoria_pai_id,c.drive_pasta_id,c.ativo,"
    + "c.disciplina_id,c.concurso_id,c.classificacao_origem,"
    + "c.disciplina_id AS disciplina_efetiva_id,c.concurso_id AS concurso_efetivo_id,"
    + "CAST(c.nome AS CHAR(4000)) AS caminho_texto,0 AS nivel "
    + "FROM categorias c WHERE c.categoria_pai_id IS NULL "
    + "UNION ALL "
    + "SELECT f.id,f.nome,f.descricao,f.categoria_pai_id,f.drive_pasta_id,f.ativo,"
    + "f.disciplina_id,f.concurso_id,f.classificacao_origem,"
    + "COALESCE(f.disciplina_id,p.disciplina_efetiva_id),"
    + "COALESCE(f.concurso_id,p.concurso_efetivo_id),"
    + "CONCAT(p.caminho_texto,' / ',f.nome),p.nivel+1 "
    + "FROM categorias f INNER JOIN arvore p ON f.categoria_pai_id=p.id) ";
}

function mapearPasta(registro) {
  return {
    id: Number(registro.id),
    nome: registro.nome,
    descricao: registro.descricao,
    quantidadePastas: Number(registro.quantidade_pastas || 0),
    quantidadeMateriais: Number(registro.quantidade_materiais || 0),
    disciplina: registro.disciplina_nome ? { id: Number(registro.disciplina_efetiva_id), nome: registro.disciplina_nome } : null,
    concurso: registro.concurso_nome ? { id: Number(registro.concurso_efetivo_id), nome: registro.concurso_nome } : null,
    classificacaoDireta: Boolean(registro.disciplina_id || registro.concurso_id),
    classificacaoOrigem: registro.classificacao_origem
  };
}

function mapearMaterial(registro) {
  return {
    id: Number(registro.id),
    nome: registro.nome,
    tipo: registro.tipo,
    extensao: registro.extensao,
    tamanhoBytes: registro.tamanho_bytes === null ? null : Number(registro.tamanho_bytes),
    modificadoEm: registro.drive_modificado_em,
    pasta: registro.categoria_nome ? { id: Number(registro.categoria_id), nome: registro.categoria_nome } : null,
    caminho: registro.caminho_texto || "",
    disciplina: registro.disciplina_nome ? { id: Number(registro.disciplina_efetiva_id), nome: registro.disciplina_nome } : null,
    concurso: registro.concurso_nome ? { id: Number(registro.concurso_efetivo_id), nome: registro.concurso_nome } : null
  };
}

function criarAcervoRepository(pool) {
  async function buscarCategoria(id) {
    const [registros] = await pool.execute(
      criarArvoreSql() + "SELECT * FROM arvore WHERE id=? AND ativo=1 LIMIT 1",
      [id]
    );
    return registros[0] || null;
  }

  async function listarBreadcrumb(id) {
    if (!id) {
      return [];
    }
    const [registros] = await pool.execute(
      "WITH RECURSIVE caminho AS ("
      + "SELECT id,nome,categoria_pai_id,0 AS nivel FROM categorias WHERE id=? AND ativo=1 "
      + "UNION ALL SELECT p.id,p.nome,p.categoria_pai_id,c.nivel+1 FROM categorias p "
      + "INNER JOIN caminho c ON c.categoria_pai_id=p.id WHERE p.ativo=1) "
      + "SELECT id,nome FROM caminho ORDER BY nivel DESC",
      [id]
    );
    return registros.map(function mapear(item) {
      return { id: Number(item.id), nome: item.nome };
    });
  }

  async function listarPastas(categoriaId) {
    const [registros] = await pool.execute(
      criarArvoreSql()
      + "SELECT a.*,d.nome AS disciplina_nome,c.nome AS concurso_nome,"
      + "(SELECT COUNT(*) FROM categorias f WHERE f.categoria_pai_id=a.id AND f.ativo=1) AS quantidade_pastas,"
      + "(SELECT COUNT(*) FROM materiais m WHERE m.categoria_id=a.id AND m.disponivel=1 AND m.tipo IN ('pdf','video')) AS quantidade_materiais "
      + "FROM arvore a LEFT JOIN disciplinas d ON d.id=a.disciplina_efetiva_id AND d.ativo=1 "
      + "LEFT JOIN concursos c ON c.id=a.concurso_efetivo_id AND c.ativo=1 "
      + "WHERE a.ativo=1 AND a.categoria_pai_id <=> ? ORDER BY a.nome ASC",
      [categoriaId]
    );
    return registros.map(mapearPasta);
  }

  function criarCondicoes(filtros) {
    const condicoes = ["m.disponivel=1", "m.tipo IN ('pdf','video')", "a.ativo=1"];
    const parametros = [];
    if (filtros.categoriaId && !filtros.busca && !filtros.disciplinaId && !filtros.concursoId && !filtros.tipo) {
      condicoes.push("m.categoria_id=?");
      parametros.push(filtros.categoriaId);
    } else if (filtros.categoriaId) {
      condicoes.push("(a.id=? OR a.caminho_texto LIKE CONCAT((SELECT caminho_texto FROM arvore WHERE id=?),' / %'))");
      parametros.push(filtros.categoriaId, filtros.categoriaId);
    }
    if (filtros.busca) {
      condicoes.push("(m.nome LIKE ? OR a.caminho_texto LIKE ?)");
      parametros.push("%" + filtros.busca + "%", "%" + filtros.busca + "%");
    }
    if (filtros.tipo) {
      condicoes.push("m.tipo=?");
      parametros.push(filtros.tipo);
    }
    if (filtros.disciplinaId) {
      condicoes.push("COALESCE(m.disciplina_id,a.disciplina_efetiva_id)=?");
      parametros.push(filtros.disciplinaId);
    }
    if (filtros.concursoId) {
      condicoes.push("COALESCE(m.concurso_id,a.concurso_efetivo_id)=?");
      parametros.push(filtros.concursoId);
    }
    return { sql: condicoes.join(" AND "), parametros: parametros };
  }

  async function listarMateriais(filtros) {
    const consulta = criarCondicoes(filtros);
    const ordens = {
      nome_asc: "m.nome ASC,m.id ASC",
      nome_desc: "m.nome DESC,m.id DESC",
      recente: "m.drive_modificado_em DESC,m.id DESC"
    };
    const base = "FROM materiais m INNER JOIN arvore a ON a.id=m.categoria_id "
      + "LEFT JOIN disciplinas d ON d.id=COALESCE(m.disciplina_id,a.disciplina_efetiva_id) AND d.ativo=1 "
      + "LEFT JOIN concursos c ON c.id=COALESCE(m.concurso_id,a.concurso_efetivo_id) AND c.ativo=1 "
      + "WHERE " + consulta.sql;
    const [totais] = await pool.execute("WITH RECURSIVE arvore AS (SELECT c.id,c.nome,c.categoria_pai_id,c.ativo,c.disciplina_id AS disciplina_efetiva_id,c.concurso_id AS concurso_efetivo_id,CAST(c.nome AS CHAR(4000)) AS caminho_texto FROM categorias c WHERE c.categoria_pai_id IS NULL UNION ALL SELECT f.id,f.nome,f.categoria_pai_id,f.ativo,COALESCE(f.disciplina_id,p.disciplina_efetiva_id),COALESCE(f.concurso_id,p.concurso_efetivo_id),CONCAT(p.caminho_texto,' / ',f.nome) FROM categorias f INNER JOIN arvore p ON f.categoria_pai_id=p.id) SELECT COUNT(*) AS total FROM materiais m INNER JOIN arvore a ON a.id=m.categoria_id WHERE " + consulta.sql, consulta.parametros);
    const deslocamento = (filtros.pagina - 1) * filtros.limite;
    const [registros] = await pool.execute(
      criarArvoreSql() + "SELECT m.id,m.nome,m.tipo,m.extensao,m.tamanho_bytes,m.drive_modificado_em,"
      + "m.categoria_id,a.nome AS categoria_nome,a.caminho_texto,"
      + "COALESCE(m.disciplina_id,a.disciplina_efetiva_id) AS disciplina_efetiva_id,d.nome AS disciplina_nome,"
      + "COALESCE(m.concurso_id,a.concurso_efetivo_id) AS concurso_efetivo_id,c.nome AS concurso_nome "
      + base + " ORDER BY " + ordens[filtros.ordenar] + " LIMIT ? OFFSET ?",
      consulta.parametros.concat([filtros.limite, deslocamento])
    );
    return { itens: registros.map(mapearMaterial), total: Number(totais[0].total) };
  }

  async function listarFiltros() {
    const [disciplinas] = await pool.execute("SELECT id,nome FROM disciplinas WHERE ativo=1 ORDER BY nome");
    const [concursos] = await pool.execute("SELECT id,nome FROM concursos WHERE ativo=1 ORDER BY nome");
    return {
      disciplinas: disciplinas.map(function mapear(item) { return { id: Number(item.id), nome: item.nome }; }),
      concursos: concursos.map(function mapear(item) { return { id: Number(item.id), nome: item.nome }; })
    };
  }

  async function buscarMaterialDisponivel(id) {
    const [registros] = await pool.execute(
      "SELECT m.id,m.drive_file_id,m.nome,m.mime_type,m.tipo,m.extensao,m.tamanho_bytes,m.resource_key "
      + "FROM materiais m INNER JOIN categorias c ON c.id=m.categoria_id "
      + "WHERE m.id=? AND m.disponivel=1 AND m.tipo IN ('pdf','video') AND c.ativo=1 LIMIT 1",
      [id]
    );
    return registros[0] || null;
  }

  async function atualizarClassificacaoCategoria(id, dados) {
    await pool.execute(
      "UPDATE categorias SET disciplina_id=?,concurso_id=?,classificacao_origem='manual' WHERE id=?",
      [dados.disciplinaId, dados.concursoId, id]
    );
    return buscarCategoria(id);
  }

  async function contarNaoClassificados() {
    const [registros] = await pool.execute(
      criarArvoreSql() + "SELECT COUNT(*) AS total FROM materiais m INNER JOIN arvore a ON a.id=m.categoria_id "
      + "WHERE m.disponivel=1 AND m.tipo IN ('pdf','video') "
      + "AND a.disciplina_efetiva_id IS NULL AND a.concurso_efetivo_id IS NULL"
    );
    return Number(registros[0].total);
  }

  return {
    buscarCategoria: buscarCategoria,
    listarBreadcrumb: listarBreadcrumb,
    listarPastas: listarPastas,
    listarMateriais: listarMateriais,
    listarFiltros: listarFiltros,
    buscarMaterialDisponivel: buscarMaterialDisponivel,
    atualizarClassificacaoCategoria: atualizarClassificacaoCategoria,
    contarNaoClassificados: contarNaoClassificados
  };
}

module.exports = criarAcervoRepository;
