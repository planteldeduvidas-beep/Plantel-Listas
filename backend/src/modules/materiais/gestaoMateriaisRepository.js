function mapearMaterial(item) {
  if (!item) return null;
  return {
    id: Number(item.id),
    driveFileId: item.drive_file_id,
    driveParentFileId: item.drive_parent_file_id,
    categoriaId: item.categoria_id === null ? null : Number(item.categoria_id),
    categoriaDriveId: item.categoria_drive_id,
    nome: item.nome,
    mimeType: item.mime_type,
    tipo: item.tipo,
    extensao: item.extensao,
    tamanhoBytes: item.tamanho_bytes === null ? null : Number(item.tamanho_bytes),
    disciplinaId: item.disciplina_id === null ? null : Number(item.disciplina_id),
    concursoId: item.concurso_id === null ? null : Number(item.concurso_id),
    estado: item.estado_gestao,
    categoriaAnteriorId: item.categoria_anterior_id === null ? null : Number(item.categoria_anterior_id),
    versao: Number(item.versao)
  };
}

function criarGestaoMateriaisRepository(pool) {
  async function buscarMaterial(id, executorInformado) {
    const executor = executorInformado || pool;
    const [registros] = await executor.execute(
      "SELECT m.*,c.drive_pasta_id AS categoria_drive_id FROM materiais m "
      + "LEFT JOIN categorias c ON c.id=m.categoria_id WHERE m.id=? LIMIT 1",
      [id]
    );
    return mapearMaterial(registros[0]);
  }

  async function buscarCategoria(id) {
    const [registros] = await pool.execute(
      "SELECT id,nome,drive_pasta_id,ativo FROM categorias WHERE id=? LIMIT 1",
      [id]
    );
    if (!registros[0]) return null;
    return { id: Number(registros[0].id), nome: registros[0].nome, drivePastaId: registros[0].drive_pasta_id, ativo: Boolean(registros[0].ativo) };
  }

  async function professorPodeAcessarCategoria(professorId, categoriaId) {
    const [registros] = await pool.execute(
      "WITH RECURSIVE ancestrais AS (SELECT id,categoria_pai_id FROM categorias WHERE id=? AND ativo=1 "
      + "UNION ALL SELECT p.id,p.categoria_pai_id FROM categorias p INNER JOIN ancestrais a ON a.categoria_pai_id=p.id WHERE p.ativo=1) "
      + "SELECT 1 AS permitido FROM ancestrais a INNER JOIN permissoes_professor_categoria pc ON pc.categoria_id=a.id "
      + "WHERE pc.professor_id=? AND pc.revogada_em IS NULL LIMIT 1",
      [categoriaId, professorId]
    );
    return registros.length === 1;
  }

  async function listarPastasGerenciaveis(usuario) {
    let registros;
    if (usuario.papel === "admin") {
      [registros] = await pool.execute(
        "WITH RECURSIVE arvore AS (SELECT id,nome,categoria_pai_id,drive_pasta_id,CAST(nome AS CHAR(4000)) caminho FROM categorias WHERE categoria_pai_id IS NULL AND ativo=1 "
        + "UNION ALL SELECT c.id,c.nome,c.categoria_pai_id,c.drive_pasta_id,CONCAT(a.caminho,' / ',c.nome) FROM categorias c INNER JOIN arvore a ON c.categoria_pai_id=a.id WHERE c.ativo=1) "
        + "SELECT id,nome,caminho FROM arvore WHERE drive_pasta_id IS NOT NULL ORDER BY caminho"
      );
    } else {
      [registros] = await pool.execute(
        "WITH RECURSIVE permitidas AS (SELECT c.id,c.nome,c.categoria_pai_id,c.drive_pasta_id,CAST(c.nome AS CHAR(4000)) caminho "
        + "FROM categorias c INNER JOIN permissoes_professor_categoria p ON p.categoria_id=c.id "
        + "WHERE p.professor_id=? AND p.revogada_em IS NULL AND c.ativo=1 "
        + "UNION DISTINCT SELECT c.id,c.nome,c.categoria_pai_id,c.drive_pasta_id,CONCAT(p.caminho,' / ',c.nome) "
        + "FROM categorias c INNER JOIN permitidas p ON c.categoria_pai_id=p.id WHERE c.ativo=1) "
        + "SELECT id,nome,caminho FROM permitidas WHERE drive_pasta_id IS NOT NULL ORDER BY caminho",
        [usuario.id]
      );
    }
    return registros.map(function mapear(item) { return { id: Number(item.id), nome: item.nome, caminho: item.caminho }; });
  }

  async function criarMaterial(dados, usuarioId) {
    const conexao = await pool.getConnection();
    try {
      await conexao.beginTransaction();
      const [resultado] = await conexao.execute(
        "INSERT INTO materiais (drive_file_id,drive_parent_file_id,categoria_id,disciplina_id,concurso_id,nome,mime_type,tipo,extensao,tamanho_bytes,checksum_md5,drive_criado_em,drive_modificado_em,resource_key,disponivel,estado_gestao,ultima_sincronizacao_drive_id) "
        + "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,'disponivel',NULL)",
        [dados.driveFileId,dados.driveParentFileId,dados.categoriaId,dados.disciplinaId,dados.concursoId,dados.nome,dados.mimeType,dados.tipo,dados.extensao,dados.tamanhoBytes,dados.checksumMd5,dados.driveCriadoEm,dados.driveModificadoEm,dados.resourceKey]
      );
      const id = Number(resultado.insertId);
      await registrarAuditoria(conexao, id, usuarioId, "upload", "concluida", { categoriaId: dados.categoriaId, tipo: dados.tipo });
      await conexao.commit();
      return buscarMaterial(id);
    } catch (erro) {
      await conexao.rollback();
      throw erro;
    } finally { conexao.release(); }
  }

  async function atualizarMaterial(id, versao, campos, usuarioId, operacao) {
    const permitidos = {
      nome: "nome", disciplinaId: "disciplina_id", concursoId: "concurso_id",
      categoriaId: "categoria_id", driveParentFileId: "drive_parent_file_id",
      driveFileId: "drive_file_id", mimeType: "mime_type", tipo: "tipo", extensao: "extensao",
      tamanhoBytes: "tamanho_bytes", checksumMd5: "checksum_md5", driveModificadoEm: "drive_modificado_em",
      resourceKey: "resource_key"
    };
    const entradas = Object.keys(campos).filter(function filtrar(chave) { return permitidos[chave]; });
    const atribuicoes = entradas.map(function mapear(chave) { return permitidos[chave] + "=?"; });
    const valores = entradas.map(function valor(chave) { return campos[chave]; });
    atribuicoes.push("versao=versao+1");
    const conexao = await pool.getConnection();
    try {
      await conexao.beginTransaction();
      const [resultado] = await conexao.execute(
        "UPDATE materiais SET " + atribuicoes.join(",") + " WHERE id=? AND versao=? AND estado_gestao='disponivel'",
        valores.concat([id, versao])
      );
      if (resultado.affectedRows !== 1) throw new Error("CONCORRENCIA_MATERIAL");
      await registrarAuditoria(conexao, id, usuarioId, operacao, "concluida", { campos: entradas });
      await conexao.commit();
      return buscarMaterial(id);
    } catch (erro) { await conexao.rollback(); throw erro; } finally { conexao.release(); }
  }

  async function enviarLixeira(id, versao, usuarioId) {
    const conexao = await pool.getConnection();
    try {
      await conexao.beginTransaction();
      const [resultado] = await conexao.execute(
        "UPDATE materiais SET categoria_anterior_id=categoria_id,estado_gestao='lixeira',disponivel=0,enviado_lixeira_por_usuario_id=?,enviado_lixeira_em=CURRENT_TIMESTAMP(3),versao=versao+1 WHERE id=? AND versao=? AND estado_gestao='disponivel'",
        [usuarioId,id,versao]
      );
      if (resultado.affectedRows !== 1) throw new Error("CONCORRENCIA_MATERIAL");
      await registrarAuditoria(conexao,id,usuarioId,"lixeira","concluida",{});
      await conexao.commit();
    } catch (erro) { await conexao.rollback(); throw erro; } finally { conexao.release(); }
  }

  async function restaurar(id, versao, usuarioId) {
    const conexao = await pool.getConnection();
    try {
      await conexao.beginTransaction();
      const [resultado] = await conexao.execute(
        "UPDATE materiais SET categoria_id=categoria_anterior_id,estado_gestao='disponivel',disponivel=1,categoria_anterior_id=NULL,enviado_lixeira_por_usuario_id=NULL,enviado_lixeira_em=NULL,versao=versao+1 WHERE id=? AND versao=? AND estado_gestao='lixeira'",
        [id,versao]
      );
      if (resultado.affectedRows !== 1) throw new Error("CONCORRENCIA_MATERIAL");
      await registrarAuditoria(conexao,id,usuarioId,"restauracao","concluida",{});
      await conexao.commit();
    } catch (erro) { await conexao.rollback(); throw erro; } finally { conexao.release(); }
  }

  async function marcarExclusao(id, versao, usuarioId) {
    const conexao = await pool.getConnection();
    try {
      await conexao.beginTransaction();
      const [resultado] = await conexao.execute("UPDATE materiais SET estado_gestao='exclusao_pendente',disponivel=0,versao=versao+1 WHERE id=? AND versao=? AND estado_gestao='lixeira'",[id,versao]);
      if (resultado.affectedRows !== 1) throw new Error("CONCORRENCIA_MATERIAL");
      await registrarAuditoria(conexao,id,usuarioId,"exclusao_definitiva","compensacao_pendente",{});
      const pendente = await buscarMaterial(id, conexao);
      await conexao.commit();
      return pendente;
    } catch (erro) { await conexao.rollback(); throw erro; } finally { conexao.release(); }
  }

  async function concluirExclusao(id, usuarioId) {
    const conexao = await pool.getConnection();
    try {
      await conexao.beginTransaction();
      const [resultado] = await conexao.execute("UPDATE materiais SET estado_gestao='excluido',disponivel=0,versao=versao+1 WHERE id=? AND estado_gestao='exclusao_pendente'",[id]);
      if (resultado.affectedRows !== 1) throw new Error("CONCORRENCIA_MATERIAL");
      await registrarAuditoria(conexao,id,usuarioId,"exclusao_definitiva","concluida",{});
      await conexao.commit();
    } catch (erro) { await conexao.rollback(); throw erro; } finally { conexao.release(); }
  }

  async function reverterExclusao(id) {
    await pool.execute("UPDATE materiais SET estado_gestao='lixeira',versao=versao+1 WHERE id=? AND estado_gestao='exclusao_pendente'",[id]);
  }

  async function listarLixeira() {
    const [registros] = await pool.execute(
      "SELECT m.id,m.nome,m.tipo,m.tamanho_bytes,m.enviado_lixeira_em,m.versao,m.estado_gestao,c.nome AS pasta_nome "
      + "FROM materiais m LEFT JOIN categorias c ON c.id=m.categoria_anterior_id WHERE m.estado_gestao IN ('lixeira','exclusao_pendente') ORDER BY m.enviado_lixeira_em DESC"
    );
    return registros.map(function mapear(item) { return { id:Number(item.id),nome:item.nome,tipo:item.tipo,tamanhoBytes:item.tamanho_bytes===null?null:Number(item.tamanho_bytes),enviadoEm:item.enviado_lixeira_em,versao:Number(item.versao),pasta:item.pasta_nome,exclusaoPendente:item.estado_gestao==="exclusao_pendente" }; });
  }

  async function registrarAuditoria(executor, materialId, usuarioId, operacao, resultado, detalhes) {
    await executor.execute("INSERT INTO auditoria_materiais (material_id,usuario_id,operacao,resultado,detalhes) VALUES (?,?,?,?,?)",[materialId,usuarioId,operacao,resultado,JSON.stringify(detalhes || {})]);
  }

  return { buscarMaterial, buscarCategoria, professorPodeAcessarCategoria, listarPastasGerenciaveis, criarMaterial, atualizarMaterial, enviarLixeira, restaurar, marcarExclusao, concluirExclusao, reverterExclusao, listarLixeira, registrarAuditoria };
}

module.exports = criarGestaoMateriaisRepository;
