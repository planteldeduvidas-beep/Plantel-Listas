function criarAnalyticsRepository(pool) {
  async function registrarHistorico(executor, usuario, materialId, tipo) {
    if (usuario.papel !== "aluno") return;
    const foiDownload = tipo === "download";
    const datasDeInsercao = foiDownload
      ? "NULL,CURRENT_TIMESTAMP(3)"
      : "CURRENT_TIMESTAMP(3),NULL";
    const campoDaAcao = foiDownload
      ? "ultimo_download_em"
      : "ultima_visualizacao_em";
    await executor.execute(
      "INSERT INTO historico_materiais_usuario "
      + "(usuario_id,material_id,ultima_acao,ultima_visualizacao_em,ultimo_download_em,atualizado_em) "
      + "VALUES (?,?,?," + datasDeInsercao + ",CURRENT_TIMESTAMP(3)) "
      + "ON DUPLICATE KEY UPDATE ultima_acao=?,"
      + campoDaAcao + "=CURRENT_TIMESTAMP(3),"
      + "atualizado_em=CURRENT_TIMESTAMP(3)",
      [usuario.id, materialId, tipo, tipo]
    );
  }

  async function registrarUso(usuario, materialId, tipo, chave) {
    const conexao = await pool.getConnection();
    try {
      await conexao.beginTransaction();
      await conexao.execute(
        "INSERT IGNORE INTO eventos_uso_acervo (usuario_id,material_id,tipo,chave_deduplicacao,papel_no_evento) VALUES (?,?,?,?,?)",
        [usuario.id, materialId, tipo, chave, usuario.papel]
      );
      await registrarHistorico(conexao, usuario, materialId, tipo);
      await conexao.commit();
    } catch (erro) {
      await conexao.rollback();
      throw erro;
    } finally {
      conexao.release();
    }
  }

  async function registrarHistoricoAposFalha(usuario, materialId, tipo) {
    return registrarHistorico(pool, usuario, materialId, tipo);
  }

  async function registrarConsulta(usuarioId, categoriaId, busca, chave, tipo) {
    await pool.execute(
      "INSERT IGNORE INTO eventos_uso_acervo (usuario_id,categoria_id,tipo,termo_busca,chave_deduplicacao,papel_no_evento) SELECT ?,?,?,?,?,papel FROM usuarios WHERE id=?",
      [usuarioId, categoriaId || null, tipo, busca || null, chave, usuarioId]
    );
  }

  async function resumo() {
    const [materiais] = await pool.execute(
      "SELECT COUNT(*) AS total,SUM(tipo='pdf') AS pdfs,SUM(tipo='video') AS videos "
      + "FROM materiais WHERE disponivel=1 AND estado_gestao='disponivel' AND tipo IN ('pdf','video')"
    );
    const [usuarios] = await pool.execute(
      "SELECT COUNT(*) AS total,SUM(papel='aluno') AS alunos,SUM(papel='professor') AS professores,"
      + "SUM(papel='admin') AS administradores,SUM(ativo=1) AS ativos FROM usuarios WHERE excluido_em IS NULL AND NOT EXISTS(SELECT 1 FROM cadastros_email_pendentes p WHERE p.usuario_id=usuarios.id)"
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
      + "SELECT dia,navegacoes_alunos AS acessos,aberturas_alunos AS visualizacoes,downloads_alunos AS downloads,alunos_ativos FROM analytics_resumo_diario WHERE navegacoes_alunos IS NOT NULL AND dia>=DATE_SUB(CURRENT_DATE,INTERVAL ? DAY) "
      + "UNION ALL SELECT DATE(e.criado_em),SUM(e.tipo='acesso'),SUM(e.tipo='visualizacao'),SUM(e.tipo='download'),"
      + "COUNT(DISTINCT IF(e.tipo='acesso',e.usuario_id,NULL)) FROM eventos_uso_acervo e INNER JOIN usuarios u ON u.id=e.usuario_id "
      + "WHERE COALESCE(e.papel_no_evento,u.papel)='aluno' AND e.criado_em>=DATE_SUB(CURRENT_DATE,INTERVAL ? DAY) GROUP BY DATE(e.criado_em)) dados GROUP BY dia ORDER BY dia",
      [periodo - 1, periodo - 1]
    );
    return registros;
  }

  async function engajamento(periodo) {
    const [registros] = await pool.execute(
      "SELECT SUM(teve_navegacao) AS alunos_com_navegacao,SUM(teve_material) AS alunos_com_material,"
      + "SUM(teve_navegacao AND teve_material) AS alunos_que_navegaram_e_interagiram,SUM(buscas) AS buscas FROM ("
      + "SELECT e.usuario_id,MAX(e.tipo='acesso') AS teve_navegacao,"
      + "MAX(e.tipo IN ('visualizacao','download')) AS teve_material,"
      + "SUM(e.tipo='busca') AS buscas FROM eventos_uso_acervo e INNER JOIN usuarios u ON u.id=e.usuario_id "
      + "WHERE COALESCE(e.papel_no_evento,u.papel)='aluno' AND e.criado_em>=DATE_SUB(CURRENT_DATE,INTERVAL ? DAY) GROUP BY e.usuario_id) dados", [periodo - 1]
    );
    return registros[0];
  }

  async function buscas(periodo) {
    const [registros] = await pool.execute(
      "SELECT termo,SUM(quantidade) AS quantidade FROM (SELECT termo_busca AS termo,quantidade_alunos AS quantidade FROM analytics_buscas_diario "
      + "WHERE quantidade_alunos>0 AND dia>=DATE_SUB(CURRENT_DATE,INTERVAL ? DAY) UNION ALL SELECT e.termo_busca,COUNT(*) FROM eventos_uso_acervo e INNER JOIN usuarios u ON u.id=e.usuario_id "
      + "WHERE COALESCE(e.papel_no_evento,u.papel)='aluno' AND e.tipo='busca' AND e.criado_em>=DATE_SUB(CURRENT_DATE,INTERVAL ? DAY) GROUP BY e.termo_busca) dados "
      + "GROUP BY termo ORDER BY quantidade DESC,termo LIMIT 20",
      [periodo - 1, periodo - 1]
    );
    return registros;
  }

  async function pastasMaisAcessadas(periodo) {
    const [registros] = await pool.execute(
      "SELECT nome,SUM(quantidade) AS quantidade FROM (SELECT pasta_nome AS nome,quantidade_alunos AS quantidade FROM analytics_pastas_diario "
      + "WHERE quantidade_alunos>0 AND dia>=DATE_SUB(CURRENT_DATE,INTERVAL ? DAY) UNION ALL SELECT COALESCE(c.nome,'Inicio da biblioteca'),COUNT(*) "
      + "FROM eventos_uso_acervo e INNER JOIN usuarios u ON u.id=e.usuario_id LEFT JOIN categorias c ON c.id=e.categoria_id WHERE e.tipo='acesso' AND COALESCE(e.papel_no_evento,u.papel)='aluno' "
      + "AND e.criado_em>=DATE_SUB(CURRENT_DATE,INTERVAL ? DAY) GROUP BY c.id,c.nome) dados "
      + "GROUP BY nome ORDER BY quantidade DESC,nome LIMIT 20",
      [periodo - 1, periodo - 1]
    );
    return registros;
  }

  async function maisUsados(periodo) {
    const [registros] = await pool.execute(
      "SELECT material_id AS id,MAX(nome) AS nome,SUM(visualizacoes) AS visualizacoes,SUM(downloads) AS downloads,"
      + "SUM(visualizacoes+downloads) AS acessos FROM (SELECT material_id,material_nome AS nome,aberturas_alunos AS visualizacoes,downloads_alunos AS downloads "
      + "FROM analytics_materiais_diario WHERE aberturas_alunos+downloads_alunos>0 AND dia>=DATE_SUB(CURRENT_DATE,INTERVAL ? DAY) UNION ALL "
      + "SELECT m.id,m.nome,SUM(e.tipo='visualizacao'),SUM(e.tipo='download') FROM eventos_uso_acervo e "
      + "INNER JOIN usuarios u ON u.id=e.usuario_id INNER JOIN materiais m ON m.id=e.material_id WHERE COALESCE(e.papel_no_evento,u.papel)='aluno' AND e.tipo IN ('visualizacao','download') "
      + "AND e.criado_em>=DATE_SUB(CURRENT_DATE,INTERVAL ? DAY) GROUP BY m.id,m.nome) dados "
      + "GROUP BY material_id ORDER BY acessos DESC,nome ASC LIMIT 15",
      [periodo - 1, periodo - 1]
    );
    return registros;
  }

  async function cobertura(periodo) {
    const [resumos] = await pool.execute(
      "SELECT dia,acessos,visualizacoes,downloads,navegacoes_alunos IS NULL AS sem_segmentacao FROM analytics_resumo_diario WHERE dia>=DATE_SUB(CURRENT_DATE,INTERVAL ? DAY) ORDER BY dia", [periodo - 1]
    );
    const [[eventos]] = await pool.execute(
      "SELECT COUNT(*) AS eventos_sem_papel FROM eventos_uso_acervo WHERE papel_no_evento IS NULL AND criado_em>=DATE_SUB(CURRENT_DATE,INTERVAL ? DAY)", [periodo - 1]
    );
    return { resumos, eventosSemPapel: Number(eventos.eventos_sem_papel) };
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
      "SELECT operacao,COUNT(*) AS quantidade FROM auditoria_materiais WHERE criado_em>=DATE_SUB(CURRENT_DATE,INTERVAL ? DAY) "
      + "GROUP BY operacao ORDER BY quantidade DESC,operacao",
      [periodo - 1]
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
            "INSERT INTO analytics_resumo_diario (dia,acessos,visualizacoes,downloads,alunos_ativos,navegacoes_alunos,aberturas_alunos,downloads_alunos) "
            + "SELECT DATE(e.criado_em),SUM(e.tipo='acesso'),SUM(e.tipo='visualizacao'),SUM(e.tipo='download'),"
            + "COUNT(DISTINCT IF(e.tipo='acesso' AND COALESCE(e.papel_no_evento,u.papel)='aluno',e.usuario_id,NULL)),"
            + "SUM(e.tipo='acesso' AND COALESCE(e.papel_no_evento,u.papel)='aluno'),SUM(e.tipo='visualizacao' AND COALESCE(e.papel_no_evento,u.papel)='aluno'),SUM(e.tipo='download' AND COALESCE(e.papel_no_evento,u.papel)='aluno') FROM eventos_uso_acervo e "
            + "INNER JOIN usuarios u ON u.id=e.usuario_id WHERE DATE(e.criado_em)=? GROUP BY DATE(e.criado_em) "
            + "ON DUPLICATE KEY UPDATE acessos=VALUES(acessos),visualizacoes=VALUES(visualizacoes),downloads=VALUES(downloads),alunos_ativos=VALUES(alunos_ativos),navegacoes_alunos=VALUES(navegacoes_alunos),aberturas_alunos=VALUES(aberturas_alunos),downloads_alunos=VALUES(downloads_alunos)", [dia]
          );
          await conexao.execute(
            "INSERT INTO analytics_materiais_diario (dia,material_id,material_nome,visualizacoes,downloads,aberturas_alunos,downloads_alunos) "
            + "SELECT DATE(e.criado_em),m.id,m.nome,SUM(e.tipo='visualizacao'),SUM(e.tipo='download'),"
            + "SUM(e.tipo='visualizacao' AND COALESCE(e.papel_no_evento,u.papel)='aluno'),SUM(e.tipo='download' AND COALESCE(e.papel_no_evento,u.papel)='aluno') FROM eventos_uso_acervo e "
            + "INNER JOIN usuarios u ON u.id=e.usuario_id INNER JOIN materiais m ON m.id=e.material_id WHERE DATE(e.criado_em)=? AND e.tipo IN ('visualizacao','download') "
            + "GROUP BY DATE(e.criado_em),m.id,m.nome ON DUPLICATE KEY UPDATE material_nome=VALUES(material_nome),"
            + "visualizacoes=VALUES(visualizacoes),downloads=VALUES(downloads),aberturas_alunos=VALUES(aberturas_alunos),downloads_alunos=VALUES(downloads_alunos)", [dia]
          );
          await conexao.execute(
            "INSERT INTO analytics_buscas_diario (dia,termo_busca,quantidade,quantidade_alunos) SELECT DATE(e.criado_em),e.termo_busca,COUNT(*),SUM(COALESCE(e.papel_no_evento,u.papel)='aluno') "
            + "FROM eventos_uso_acervo e INNER JOIN usuarios u ON u.id=e.usuario_id WHERE DATE(e.criado_em)=? AND e.tipo='busca' GROUP BY DATE(e.criado_em),e.termo_busca "
            + "ON DUPLICATE KEY UPDATE quantidade=VALUES(quantidade),quantidade_alunos=VALUES(quantidade_alunos)", [dia]
          );
          await conexao.execute(
            "INSERT INTO analytics_pastas_diario (dia,pasta_chave,pasta_nome,quantidade,quantidade_alunos) "
            + "SELECT DATE(e.criado_em),COALESCE(CAST(e.categoria_id AS CHAR),'raiz'),COALESCE(c.nome,'Inicio da biblioteca'),COUNT(*),SUM(COALESCE(e.papel_no_evento,u.papel)='aluno') "
            + "FROM eventos_uso_acervo e INNER JOIN usuarios u ON u.id=e.usuario_id LEFT JOIN categorias c ON c.id=e.categoria_id WHERE DATE(e.criado_em)=? AND e.tipo='acesso' "
            + "GROUP BY DATE(e.criado_em),e.categoria_id,c.nome ON DUPLICATE KEY UPDATE pasta_nome=VALUES(pasta_nome),quantidade=VALUES(quantidade),quantidade_alunos=VALUES(quantidade_alunos)", [dia]
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
    registrarHistoricoAposFalha: registrarHistoricoAposFalha,
    registrarConsulta: registrarConsulta,
    resumo: resumo,
    porDisciplina: function porDisciplina() { return distribuicao("disciplinas", "disciplina_id"); },
    engajamento,
    cobertura,
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
