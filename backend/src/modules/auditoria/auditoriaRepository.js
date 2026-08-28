function criarAuditoriaRepository(pool) {
  async function registrar(dados) {
    await pool.execute(
      "INSERT INTO auditoria_geral (ator_usuario_id,acao,entidade,entidade_id,resultado,contexto) VALUES (?,?,?,?,?,?)",
      [dados.atorUsuarioId || null, dados.acao, dados.entidade, dados.entidadeId || null,
        dados.resultado || "concluida", JSON.stringify(dados.contexto || {})]
    );
  }

  function construirFiltros(filtros) {
    const condicoes = [];
    const parametros = [];
    if (filtros.acao) {
      condicoes.push("historico.acao=?");
      parametros.push(filtros.acao);
    }
    if (filtros.busca) {
      condicoes.push("(historico.ator_email LIKE ? OR historico.descricao LIKE ?)");
      parametros.push("%" + filtros.busca + "%", "%" + filtros.busca + "%");
    }
    if (filtros.inicio) {
      condicoes.push("historico.criado_em>=?");
      parametros.push(filtros.inicio);
    }
    if (filtros.fim) {
      condicoes.push("historico.criado_em<=?");
      parametros.push(filtros.fim);
    }
    return { sql: condicoes.length ? " WHERE " + condicoes.join(" AND ") : "", parametros: parametros };
  }

  function consultaUnificada() {
    return "(SELECT CONCAT('geral-',a.id) AS chave,a.acao,a.entidade,a.entidade_id,a.resultado,a.contexto," 
      + "a.criado_em,u.email AS ator_email,CASE a.entidade WHEN 'usuario' THEN 'Usuário' WHEN 'permissao' THEN 'Acesso de professor' ELSE 'Atividade administrativa' END AS descricao FROM auditoria_geral a "
      + "LEFT JOIN usuarios u ON u.id=a.ator_usuario_id "
      + "UNION ALL SELECT CONCAT('material-',am.id),am.operacao,'material',am.material_id,am.resultado,am.detalhes," 
      + "am.criado_em,u.email,COALESCE(m.nome,'Material removido') FROM auditoria_materiais am "
      + "LEFT JOIN usuarios u ON u.id=am.usuario_id LEFT JOIN materiais m ON m.id=am.material_id "
      + "UNION ALL SELECT CONCAT('classificacao-',ac.id),'classificacao','pasta',ac.categoria_id,'concluida'," 
      + "JSON_OBJECT('dimensao',ac.dimensao,'estadoNovo',ac.estado_novo,'origem',ac.origem),ac.criado_em,u.email,c.nome "
      + "FROM auditoria_classificacao_categorias ac LEFT JOIN usuarios u ON u.id=ac.usuario_id "
      + "LEFT JOIN categorias c ON c.id=ac.categoria_id "
      + "UNION ALL SELECT CONCAT('sincronizacao-',s.id),'sincronizacao','acervo',s.id," 
      + "IF(s.status='falhou','falhou','concluida'),JSON_OBJECT('status',s.status,'arquivos',s.arquivos_encontrados)," 
      + "s.iniciada_em,u.email,'Sincronizacao do acervo' FROM sincronizacoes_google_drive s "
      + "LEFT JOIN usuarios u ON u.id=s.iniciado_por_usuario_id) historico";
  }

  async function listar(filtros) {
    const filtro = construirFiltros(filtros);
    const base = consultaUnificada() + filtro.sql;
    const [totais] = await pool.execute("SELECT COUNT(*) AS total FROM " + base, filtro.parametros);
    const [registros] = await pool.execute(
      "SELECT * FROM " + base + " ORDER BY criado_em DESC,chave DESC LIMIT ? OFFSET ?",
      filtro.parametros.concat([filtros.limite, (filtros.pagina - 1) * filtros.limite])
    );
    return { total: Number(totais[0].total), itens: registros };
  }

  async function listarAcoes() {
    const [registros] = await pool.execute(
      "SELECT DISTINCT acao FROM " + consultaUnificada() + " ORDER BY acao"
    );
    return registros.map(function mapear(item) { return item.acao; });
  }

  return { registrar: registrar, listar: listar, listarAcoes: listarAcoes };
}

module.exports = criarAuditoriaRepository;
