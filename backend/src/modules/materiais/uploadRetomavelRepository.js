function criarUploadRetomavelRepository(pool) {
  function mapear(item) {
    if (!item) return null;
    return {...item,dados:typeof item.dados === "string" ? JSON.parse(item.dados) : item.dados,
      tamanho:Number(item.tamanho),recebido:Number(item.recebido),usuario_id:Number(item.usuario_id)};
  }
  return {
    async buscar(id) {
      const [linhas] = await pool.execute("SELECT * FROM uploads_retomaveis WHERE id=?",[id]);
      return mapear(linhas[0]);
    },
    async contar(usuarioId) {
      const [linhas] = await pool.execute("SELECT COUNT(*) total,COALESCE(SUM(usuario_id=?),0) usuario FROM uploads_retomaveis WHERE estado NOT IN ('concluido','cancelado')",[usuarioId]);
      return {total:Number(linhas[0].total),usuario:Number(linhas[0].usuario)};
    },
    async criar(s) {
      await pool.execute("INSERT INTO uploads_retomaveis (id,usuario_id,categoria_id,drive_id,dados,tamanho,expira_em) VALUES (?,?,?,?,?,?,DATE_ADD(CURRENT_TIMESTAMP(3),INTERVAL 24 HOUR))",
        [s.id,s.usuario_id,s.dados.categoriaId,s.drive_id,JSON.stringify(s.dados),s.tamanho]);
    },
    async salvar(s) {
      await pool.execute("UPDATE uploads_retomaveis SET estado=?,recebido=?,sessao_criptografada=?,atualizado_em=CURRENT_TIMESTAMP(3) WHERE id=?",
        [s.estado,s.recebido,s.sessao_criptografada || null,s.id]);
    },
    async abandonados() {
      const [linhas] = await pool.execute("SELECT * FROM uploads_retomaveis WHERE estado<>'concluido' AND expira_em<=CURRENT_TIMESTAMP(3) AND atualizado_em<DATE_SUB(CURRENT_TIMESTAMP(3),INTERVAL 1 MINUTE) AND tentativas_limpeza<20 ORDER BY atualizado_em LIMIT 4");
      return linhas.map(mapear);
    },
    async falhaLimpeza(id) { await pool.execute("UPDATE uploads_retomaveis SET tentativas_limpeza=tentativas_limpeza+1 WHERE id=?",[id]); },
    async removerAntigos() {
      await pool.execute("DELETE FROM uploads_retomaveis WHERE estado IN ('concluido','cancelado') AND criado_em<DATE_SUB(CURRENT_TIMESTAMP(3),INTERVAL 8 DAY) LIMIT 100");
    }
  };
}
module.exports = criarUploadRetomavelRepository;
