function criarAnalyticsRepository(pool) {
  async function registrarUso(usuario, materialId, tipo, chave) {
    const conexao = await pool.getConnection();
    try {
      await conexao.beginTransaction();
      await conexao.execute(
        "INSERT IGNORE INTO eventos_uso_acervo (usuario_id,material_id,tipo,chave_deduplicacao) VALUES (?,?,?,?)",
        [usuario.id, materialId, tipo, chave]
      );
      if (usuario.papel === "aluno") {
        await conexao.execute(
          "INSERT INTO historico_materiais_usuario "
          + "(usuario_id,material_id,ultima_acao,ultima_visualizacao_em,ultimo_download_em,atualizado_em) "
          + "VALUES (?,?,?,IF(?='visualizacao',CURRENT_TIMESTAMP(3),NULL),IF(?='download',CURRENT_TIMESTAMP(3),NULL),CURRENT_TIMESTAMP(3)) "
          + "ON DUPLICATE KEY UPDATE ultima_acao=VALUES(ultima_acao),"
          + "ultima_visualizacao_em=IF(VALUES(ultima_visualizacao_em) IS NULL,ultima_visualizacao_em,VALUES(ultima_visualizacao_em)),"
          + "ultimo_download_em=IF(VALUES(ultimo_download_em) IS NULL,ultimo_download_em,VALUES(ultimo_download_em)),"
          + "atualizado_em=VALUES(atualizado_em)",
          [usuario.id, materialId, tipo, tipo, tipo]
        );
      }
      await conexao.commit();
    } catch (erro) {
      await conexao.rollback();
      throw erro;
    } finally {
      conexao.release();
    }
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
      "SELECT dia,SUM(acessos) AS acessos,SUM(visualizacoes) AS visualizacoes,SUM(downloads) AS downloads,SUM(alunos_ativos) AS alunos_ativos FROM ("
      + "SELECT dia,acessos,visualizacoes,downloads,alunos_ativos FROM analytics_resumo_diario WHERE dia>=DATE_SUB(CURRENT_DATE,INTERVAL ? DAY) "
      + "UNION ALL SELECT DATE(e.criado_em),SUM(e.tipo='acesso'),SUM(e.tipo='visualizacao'),SUM(e.tipo='download'),"
      + "COUNT(DISTINCT IF(e.tipo='acesso' AND u.papel='aluno',e.usuario_id,NULL)) FROM eventos_uso_acervo e INNER JOIN usuarios u ON u.id=e.usuario_id "
      + "WHERE e.criado_em>=DATE_SUB(CURRENT_DATE,INTERVAL ? DAY) GROUP BY DATE(e.criado_em)) dados GROUP BY dia ORDER BY dia",
      [periodo - 1, periodo - 1]
    );
    return registros;
  }

  async function buscas(periodo) {
    const [registros] = await pool.execute(
      "SELECT termo,SUM(quantidade) AS quantidade FROM (SELECT termo_busca AS termo,quantidade FROM analytics_buscas_diario "
      + "WHERE dia>=DATE_SUB(CURRENT_DATE,INTERVAL ? DAY) UNION ALL SELECT termo_busca,COUNT(*) FROM eventos_uso_acervo "
      + "WHERE tipo='busca' AND criado_em>=DATE_SUB(CURRENT_TIMESTAMP(3),INTERVAL ? DAY) GROUP BY termo_busca) dados "
      + "GROUP BY termo ORDER BY quantidade DESC,termo LIMIT 20",
      [periodo, periodo]
    );
    return registros;
  }

  async function pastasMaisAcessadas(periodo) {
    const [registros] = await pool.execute(
      "SELECT nome,SUM(quantidade) AS quantidade FROM (SELECT pasta_nome AS nome,quantidade FROM analytics_pastas_diario "
      + "WHERE dia>=DATE_SUB(CURRENT_DATE,INTERVAL ? DAY) UNION ALL SELECT COALESCE(c.nome,'Inicio da biblioteca'),COUNT(*) "
      + "FROM eventos_uso_acervo e LEFT JOIN categorias c ON c.id=e.categoria_id WHERE e.tipo='acesso' "
      + "AND e.criado_em>=DATE_SUB(CURRENT_TIMESTAMP(3),INTERVAL ? DAY) GROUP BY c.id,c.nome) dados "
      + "GROUP BY nome ORDER BY quantidade DESC,nome LIMIT 20",
      [periodo, periodo]
    );
    return registros;
  }

  async function maisUsados(periodo) {
    const [registros] = await pool.execute(
      "SELECT material_id AS id,MAX(nome) AS nome,SUM(visualizacoes) AS visualizacoes,SUM(downloads) AS downloads,"
      + "SUM(visualizacoes+downloads) AS acessos FROM (SELECT material_id,material_nome AS nome,visualizacoes,downloads "
      + "FROM analytics_materiais_diario WHERE dia>=DATE_SUB(CURRENT_DATE,INTERVAL ? DAY) UNION ALL "
      + "SELECT m.id,m.nome,SUM(e.tipo='visualizacao'),SUM(e.tipo='download') FROM eventos_uso_acervo e "
      + "INNER JOIN materiais m ON m.id=e.material_id WHERE e.tipo IN ('visualizacao','download') "
      + "AND e.criado_em>=DATE_SUB(CURRENT_TIMESTAMP(3),INTERVAL ? DAY) GROUP BY m.id,m.nome) dados "
      + "GROUP BY material_id ORDER BY acessos DESC,nome ASC LIMIT 15",
      [periodo, periodo]
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

  async function consolidarEventosAnteriores(dataLimite, limiteDeExclusao) {
    const conexao = await pool.getConnection();
    let diasConsolidados = 0;
    let eventosRemovidos = 0;
    try {
      const [travas] = await conexao.execute("SELECT GET_LOCK('plantel_analytics_retencao',5) AS obtida");
      if (Number(travas[0].obtida) !== 1) throw new Error("RETENCAO_EM_ANDAMENTO");
      const [dias] = await conexao.execute("SELECT DISTINCT DATE(criado_em) AS dia FROM eventos_uso_acervo WHERE criado_em<? ORDER BY dia", [dataLimite]);
      for (const registro of dias) {
        await conexao.beginTransaction();
        try {
          const dia = registro.dia instanceof Date
            ? registro.dia.toISOString().slice(0, 10)
            : String(registro.dia).slice(0, 10);
          await conexao.execute(
            "INSERT INTO analytics_resumo_diario (dia,acessos,visualizacoes,downloads,alunos_ativos) "
            + "SELECT DATE(e.criado_em),SUM(e.tipo='acesso'),SUM(e.tipo='visualizacao'),SUM(e.tipo='download'),"
            + "COUNT(DISTINCT IF(e.tipo='acesso' AND u.papel='aluno',e.usuario_id,NULL)) FROM eventos_uso_acervo e "
            + "INNER JOIN usuarios u ON u.id=e.usuario_id WHERE DATE(e.criado_em)=? GROUP BY DATE(e.criado_em) "
            + "ON DUPLICATE KEY UPDATE acessos=VALUES(acessos),visualizacoes=VALUES(visualizacoes),downloads=VALUES(downloads),alunos_ativos=VALUES(alunos_ativos)", [dia]
          );
          await conexao.execute(
            "INSERT INTO analytics_materiais_diario (dia,material_id,material_nome,visualizacoes,downloads) "
            + "SELECT DATE(e.criado_em),m.id,m.nome,SUM(e.tipo='visualizacao'),SUM(e.tipo='download') FROM eventos_uso_acervo e "
            + "INNER JOIN materiais m ON m.id=e.material_id WHERE DATE(e.criado_em)=? AND e.tipo IN ('visualizacao','download') "
            + "GROUP BY DATE(e.criado_em),m.id,m.nome ON DUPLICATE KEY UPDATE material_nome=VALUES(material_nome),"
            + "visualizacoes=VALUES(visualizacoes),downloads=VALUES(downloads)", [dia]
          );
          await conexao.execute(
            "INSERT INTO analytics_buscas_diario (dia,termo_busca,quantidade) SELECT DATE(criado_em),termo_busca,COUNT(*) "
            + "FROM eventos_uso_acervo WHERE DATE(criado_em)=? AND tipo='busca' GROUP BY DATE(criado_em),termo_busca "
            + "ON DUPLICATE KEY UPDATE quantidade=VALUES(quantidade)", [dia]
          );
          await conexao.execute(
            "INSERT INTO analytics_pastas_diario (dia,pasta_chave,pasta_nome,quantidade) "
            + "SELECT DATE(e.criado_em),COALESCE(CAST(e.categoria_id AS CHAR),'raiz'),COALESCE(c.nome,'Inicio da biblioteca'),COUNT(*) "
            + "FROM eventos_uso_acervo e LEFT JOIN categorias c ON c.id=e.categoria_id WHERE DATE(e.criado_em)=? AND e.tipo='acesso' "
            + "GROUP BY DATE(e.criado_em),e.categoria_id,c.nome ON DUPLICATE KEY UPDATE pasta_nome=VALUES(pasta_nome),quantidade=VALUES(quantidade)", [dia]
          );
          let removidosNoLote = 1;
          while (removidosNoLote > 0) {
            const [resultado] = await conexao.query("DELETE FROM eventos_uso_acervo WHERE DATE(criado_em)=? LIMIT " + Number(limiteDeExclusao), [dia]);
            removidosNoLote = resultado.affectedRows;
            eventosRemovidos += removidosNoLote;
          }
          await conexao.commit();
          diasConsolidados += 1;
        } catch (erro) {
          await conexao.rollback();
          throw erro;
        }
      }
      return { diasConsolidados: diasConsolidados, eventosRemovidos: eventosRemovidos };
    } finally {
      await conexao.execute("SELECT RELEASE_LOCK('plantel_analytics_retencao')").catch(function ignorar() {});
      conexao.release();
    }
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
    pastasMaisAcessadas: pastasMaisAcessadas,
    consolidarEventosAnteriores: consolidarEventosAnteriores
  };
}

module.exports = criarAnalyticsRepository;
