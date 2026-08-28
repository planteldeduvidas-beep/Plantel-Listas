function criarArvoreSql() {
  return "WITH RECURSIVE arvore AS ("
    + "SELECT c.id,c.nome,c.descricao,c.categoria_pai_id,c.drive_pasta_id,c.ativo,"
    + "c.disciplina_id,c.disciplina_estado,c.disciplina_origem,c.concurso_id,c.concurso_estado,c.concurso_origem,c.classificacao_origem,"
    + "IF(c.disciplina_estado='definida',c.disciplina_id,NULL) AS disciplina_efetiva_id,IF(c.disciplina_estado='herdar','pendente',c.disciplina_estado) AS disciplina_efetiva_estado,"
    + "IF(c.concurso_estado='definida',c.concurso_id,NULL) AS concurso_efetivo_id,IF(c.concurso_estado='herdar','pendente',c.concurso_estado) AS concurso_efetivo_estado,"
    + "CAST(c.nome AS CHAR(4000)) AS caminho_texto,0 AS nivel "
    + "FROM categorias c WHERE c.categoria_pai_id IS NULL "
    + "UNION ALL "
    + "SELECT f.id,f.nome,f.descricao,f.categoria_pai_id,f.drive_pasta_id,f.ativo,"
    + "f.disciplina_id,f.disciplina_estado,f.disciplina_origem,f.concurso_id,f.concurso_estado,f.concurso_origem,f.classificacao_origem,"
    + "IF(f.disciplina_estado='herdar',p.disciplina_efetiva_id,f.disciplina_id),"
    + "IF(f.disciplina_estado='herdar',p.disciplina_efetiva_estado,f.disciplina_estado),"
    + "IF(f.concurso_estado='herdar',p.concurso_efetivo_id,f.concurso_id),"
    + "IF(f.concurso_estado='herdar',p.concurso_efetivo_estado,f.concurso_estado),"
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
    classificacaoDireta: registro.disciplina_estado !== "herdar" || registro.concurso_estado !== "herdar",
    disciplinaEstado: registro.disciplina_estado,
    concursoEstado: registro.concurso_estado,
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
    versao: Number(registro.versao || 1),
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
      + ",pastas_exibidas AS ("
      + "SELECT id FROM categorias WHERE ativo=1 AND categoria_pai_id <=> ?),"
      + "subarvore_pastas AS ("
      + "SELECT id AS pasta_raiz_id,id AS categoria_id FROM pastas_exibidas "
      + "UNION ALL "
      + "SELECT s.pasta_raiz_id,f.id FROM subarvore_pastas s "
      + "INNER JOIN categorias f ON f.categoria_pai_id=s.categoria_id AND f.ativo=1),"
      + "contagens_materiais AS ("
      + "SELECT s.pasta_raiz_id,COUNT(m.id) AS quantidade_materiais "
      + "FROM subarvore_pastas s LEFT JOIN materiais m ON m.categoria_id=s.categoria_id "
      + "AND m.disponivel=1 AND m.estado_gestao='disponivel' AND m.tipo IN ('pdf','video') "
      + "GROUP BY s.pasta_raiz_id) "
      + "SELECT a.*,d.nome AS disciplina_nome,c.nome AS concurso_nome,"
      + "(SELECT COUNT(*) FROM categorias f WHERE f.categoria_pai_id=a.id AND f.ativo=1) AS quantidade_pastas,"
      + "COALESCE(cm.quantidade_materiais,0) AS quantidade_materiais "
      + "FROM pastas_exibidas pe INNER JOIN arvore a ON a.id=pe.id "
      + "LEFT JOIN contagens_materiais cm ON cm.pasta_raiz_id=a.id "
      + "LEFT JOIN disciplinas d ON d.id=a.disciplina_efetiva_id AND d.ativo=1 "
      + "LEFT JOIN concursos c ON c.id=a.concurso_efetivo_id AND c.ativo=1 "
      + "ORDER BY a.nome ASC",
      [categoriaId]
    );
    return registros.map(mapearPasta);
  }

  function criarCondicoes(filtros) {
    const condicoes = ["m.disponivel=1", "m.estado_gestao='disponivel'", "m.tipo IN ('pdf','video')", "a.ativo=1"];
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
    const [totais] = await pool.execute(criarArvoreSql() + "SELECT COUNT(*) AS total FROM materiais m INNER JOIN arvore a ON a.id=m.categoria_id WHERE " + consulta.sql, consulta.parametros);
    const deslocamento = (filtros.pagina - 1) * filtros.limite;
    const [registros] = await pool.execute(
      criarArvoreSql() + "SELECT m.id,m.nome,m.tipo,m.extensao,m.tamanho_bytes,m.drive_modificado_em,"
      + "m.categoria_id,m.versao,a.nome AS categoria_nome,a.caminho_texto,"
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
      + "WHERE m.id=? AND m.disponivel=1 AND m.estado_gestao='disponivel' AND m.tipo IN ('pdf','video') AND c.ativo=1 LIMIT 1",
      [id]
    );
    return registros[0] || null;
  }

  async function referenciaExiste(tabela, id, conexao) {
    if (!id) {
      return true;
    }
    const [registros] = await conexao.execute("SELECT id FROM " + tabela + " WHERE id=? AND ativo=1 LIMIT 1", [id]);
    return registros.length === 1;
  }

  async function atualizarClassificacaoCategorias(ids, dados, usuarioId) {
    const conexao = await pool.getConnection();
    try {
      await conexao.beginTransaction();
      if (dados.disciplina && dados.disciplina.estado === "definida"
          && !await referenciaExiste("disciplinas", dados.disciplina.id, conexao)) {
        throw new Error("DISCIPLINA_INEXISTENTE");
      }
      if (dados.concurso && dados.concurso.estado === "definida"
          && !await referenciaExiste("concursos", dados.concurso.id, conexao)) {
        throw new Error("CONCURSO_INEXISTENTE");
      }
      for (const id of ids) {
        const [atuais] = await conexao.execute(
          "SELECT disciplina_id,disciplina_estado,concurso_id,concurso_estado FROM categorias WHERE id=? AND ativo=1 FOR UPDATE",
          [id]
        );
        if (!atuais[0]) {
          throw new Error("CATEGORIA_INEXISTENTE");
        }
        for (const dimensao of ["disciplina", "concurso"]) {
          const nova = dados[dimensao];
          if (!nova) {
            continue;
          }
          const referencia = nova.estado === "definida" ? nova.id : null;
          await conexao.execute(
            "INSERT INTO auditoria_classificacao_categorias "
            + "(categoria_id,dimensao,estado_anterior,referencia_anterior_id,estado_novo,referencia_nova_id,origem,usuario_id) "
            + "VALUES (?,?,?,?,?,?,'manual',?)",
            [id, dimensao, atuais[0][dimensao + "_estado"], atuais[0][dimensao + "_id"], nova.estado, referencia, usuarioId]
          );
          await conexao.execute(
            "UPDATE categorias SET " + dimensao + "_id=?," + dimensao + "_estado=?,"
            + dimensao + "_origem='manual'," + dimensao + "_regra_codigo=NULL,classificacao_origem='manual' WHERE id=?",
            [referencia, nova.estado, id]
          );
        }
      }
      await conexao.commit();
    } catch (erro) {
      await conexao.rollback();
      throw erro;
    } finally {
      conexao.release();
    }
  }

  async function obterOrganizacao() {
    const [registros] = await pool.execute(
      criarArvoreSql() + "SELECT COUNT(*) AS total,"
      + "SUM(IF(COALESCE(m.disciplina_id,a.disciplina_efetiva_id) IS NOT NULL,1,0)) AS com_disciplina,"
      + "SUM(IF(COALESCE(m.concurso_id,a.concurso_efetivo_id) IS NOT NULL,1,0)) AS com_concurso,"
      + "SUM(IF(COALESCE(m.disciplina_id,a.disciplina_efetiva_id) IS NOT NULL AND COALESCE(m.concurso_id,a.concurso_efetivo_id) IS NOT NULL,1,0)) AS com_ambos,"
      + "SUM(IF(a.disciplina_efetiva_estado='nao_se_aplica' OR a.concurso_efetivo_estado='nao_se_aplica',1,0)) AS nao_se_aplica,"
      + "SUM(IF((m.disciplina_id IS NULL AND a.disciplina_efetiva_estado='pendente') OR (m.concurso_id IS NULL AND a.concurso_efetivo_estado='pendente'),1,0)) AS materiais_pendentes "
      + "FROM materiais m INNER JOIN arvore a ON a.id=m.categoria_id "
      + "WHERE m.disponivel=1 AND m.estado_gestao='disponivel' AND m.tipo IN ('pdf','video') AND a.ativo=1"
    );
    const [pastas] = await pool.execute(
      criarArvoreSql() + "SELECT a.id,a.caminho_texto,a.disciplina_efetiva_estado,a.concurso_efetivo_estado,"
      + "COUNT(m.id) AS quantidade_materiais FROM arvore a INNER JOIN materiais m ON m.categoria_id=a.id "
      + "WHERE a.ativo=1 AND m.disponivel=1 AND m.estado_gestao='disponivel' AND m.tipo IN ('pdf','video') "
      + "AND ((m.disciplina_id IS NULL AND a.disciplina_efetiva_estado='pendente') "
      + "OR (m.concurso_id IS NULL AND a.concurso_efetivo_estado='pendente')) "
      + "GROUP BY a.id,a.caminho_texto,a.disciplina_efetiva_estado,a.concurso_efetivo_estado ORDER BY a.caminho_texto"
    );
    const resumo = registros[0];
    return {
      totalMateriais: Number(resumo.total || 0),
      comDisciplina: Number(resumo.com_disciplina || 0),
      comConcurso: Number(resumo.com_concurso || 0),
      comAmbos: Number(resumo.com_ambos || 0),
      naoSeAplica: Number(resumo.nao_se_aplica || 0),
      materiaisPendentes: Number(resumo.materiais_pendentes || 0),
      pastasPendentes: pastas.map(function mapear(item) {
        return {
          id: Number(item.id),
          caminho: item.caminho_texto,
          quantidadeMateriais: Number(item.quantidade_materiais),
          disciplinaPendente: item.disciplina_efetiva_estado === "pendente",
          concursoPendente: item.concurso_efetivo_estado === "pendente"
        };
      })
    };
  }

  return {
    buscarCategoria: buscarCategoria,
    listarBreadcrumb: listarBreadcrumb,
    listarPastas: listarPastas,
    listarMateriais: listarMateriais,
    listarFiltros: listarFiltros,
    buscarMaterialDisponivel: buscarMaterialDisponivel,
    atualizarClassificacaoCategorias: atualizarClassificacaoCategorias,
    obterOrganizacao: obterOrganizacao
  };
}

module.exports = criarAcervoRepository;
