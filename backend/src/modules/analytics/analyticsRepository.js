function criarAnalyticsRepository(pool) {
  async function registrarUso(usuarioId, materialId, tipo, chave) {
    await pool.execute(
      "INSERT IGNORE INTO eventos_uso_acervo (usuario_id,material_id,tipo,chave_deduplicacao) VALUES (?,?,?,?)",
      [usuarioId, materialId, tipo, chave]
    );
  }

  async function registrarConsulta(usuarioId, categoriaId, busca, chave, tipo) {
    await pool.execute(
      "INSERT IGNORE INTO eventos_uso_acervo (usuario_id,categoria_id,tipo,termo_busca,chave_deduplicacao) VALUES (?,?,?,?,?)",
      [usuarioId, categoriaId || null, tipo, busca || null, chave]
    );
  }

  async function resumo() {
    const [materiais] = await pool.execute(
      "SELECT COUNT(*) AS total,SUM(tipo='pdf') AS pdfs,SUM(tipo='video') AS videos "
      + "FROM materiais WHERE disponivel=1 AND estado_gestao='disponivel' AND tipo IN ('pdf','video')"
    );
    const [usuarios] = await pool.execute(
      "SELECT COUNT(*) AS total,SUM(papel='aluno') AS alunos,SUM(papel='professor') AS professores," 
      + "SUM(papel='admin') AS administradores,SUM(ativo=1) AS ativos FROM usuarios"
    );
    return { materiais: materiais[0], usuarios: usuarios[0] };
  }

  async function distribuicao(tabela, coluna) {
    const [registros] = await pool.execute(
      "WITH RECURSIVE arvore AS (SELECT id,categoria_pai_id," + coluna + " AS efetivo," + coluna.replace("_id", "_estado") + " AS estado FROM categorias WHERE categoria_pai_id IS NULL "
      + "UNION ALL SELECT f.id,f.categoria_pai_id,IF(f." + coluna.replace("_id", "_estado") + "='herdar',a.efetivo,f." + coluna + "),f." + coluna.replace("_id", "_estado") + " FROM categorias f INNER JOIN arvore a ON a.id=f.categoria_pai_id) "
      + "SELECT COALESCE(c.nome,'Sem classificacao') AS nome,COUNT(*) AS quantidade FROM materiais m "
      + "LEFT JOIN arvore p ON p.id=m.categoria_id LEFT JOIN " + tabela + " c ON c.id=COALESCE(m." + coluna + ",p.efetivo) "
      + "WHERE m.disponivel=1 AND m.estado_gestao='disponivel' AND m.tipo IN ('pdf','video') "
      + "GROUP BY c.id,c.nome ORDER BY quantidade DESC,nome ASC LIMIT 30"
    );
    return registros;
  }

  async function evolucao(periodo) {
    const [registros] = await pool.execute(
      "SELECT DATE(e.criado_em) AS dia,SUM(e.tipo='acesso') AS acessos,SUM(e.tipo='visualizacao') AS visualizacoes,SUM(e.tipo='download') AS downloads," 
      + "COUNT(DISTINCT IF(e.tipo='acesso' AND u.papel='aluno',e.usuario_id,NULL)) AS alunos_ativos "
      + "FROM eventos_uso_acervo e INNER JOIN usuarios u ON u.id=e.usuario_id "
      + "WHERE e.criado_em>=DATE_SUB(CURRENT_DATE,INTERVAL ? DAY) GROUP BY DATE(e.criado_em) ORDER BY dia",
      [periodo - 1]
    );
    return registros;
  }

  async function buscas(periodo) {
    const [registros] = await pool.execute(
      "SELECT termo_busca AS termo,COUNT(*) AS quantidade FROM eventos_uso_acervo WHERE tipo='busca' "
      + "AND criado_em>=DATE_SUB(CURRENT_TIMESTAMP(3),INTERVAL ? DAY) GROUP BY termo_busca ORDER BY quantidade DESC,termo_busca LIMIT 20",
      [periodo]
    );
    return registros;
  }

  async function pastasMaisAcessadas(periodo) {
    const [registros] = await pool.execute(
      "SELECT COALESCE(c.nome,'Início do acervo') AS nome,COUNT(*) AS quantidade FROM eventos_uso_acervo e "
      + "LEFT JOIN categorias c ON c.id=e.categoria_id WHERE e.tipo='acesso' AND e.criado_em>=DATE_SUB(CURRENT_TIMESTAMP(3),INTERVAL ? DAY) "
      + "GROUP BY c.id,c.nome ORDER BY quantidade DESC,nome LIMIT 20",
      [periodo]
    );
    return registros;
  }

  async function maisUsados(periodo) {
    const [registros] = await pool.execute(
      "SELECT m.id,m.nome,SUM(e.tipo='visualizacao') AS visualizacoes,SUM(e.tipo='download') AS downloads,COUNT(*) AS acessos "
      + "FROM eventos_uso_acervo e INNER JOIN materiais m ON m.id=e.material_id "
      + "WHERE e.criado_em>=DATE_SUB(CURRENT_TIMESTAMP(3),INTERVAL ? DAY) "
      + "GROUP BY m.id,m.nome ORDER BY acessos DESC,m.nome ASC LIMIT 15",
      [periodo]
    );
    return registros;
  }

  async function recentes() {
    const [registros] = await pool.execute(
      "SELECT id,nome,tipo,criado_em FROM materiais WHERE disponivel=1 AND estado_gestao='disponivel' "
      + "AND tipo IN ('pdf','video') ORDER BY criado_em DESC,id DESC LIMIT 10"
    );
    return registros;
  }

  async function atividade(periodo) {
    const [registros] = await pool.execute(
      "SELECT operacao,COUNT(*) AS quantidade FROM auditoria_materiais WHERE criado_em>=DATE_SUB(CURRENT_TIMESTAMP(3),INTERVAL ? DAY) "
      + "GROUP BY operacao ORDER BY quantidade DESC,operacao",
      [periodo]
    );
    return registros;
  }

  return {
    registrarUso: registrarUso,
    registrarConsulta: registrarConsulta,
    resumo: resumo,
    porDisciplina: function porDisciplina() { return distribuicao("disciplinas", "disciplina_id"); },
    porConcurso: function porConcurso() { return distribuicao("concursos", "concurso_id"); },
    evolucao: evolucao,
    maisUsados: maisUsados,
    recentes: recentes,
    atividade: atividade,
    buscas: buscas,
    pastasMaisAcessadas: pastasMaisAcessadas
  };
}

module.exports = criarAnalyticsRepository;
