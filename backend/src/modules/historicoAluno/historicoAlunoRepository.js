function criarHistoricoAlunoRepository(pool) {
  async function listar(usuarioId, filtros) {
    const condicoes = "h.usuario_id=? AND m.disponivel=1 AND m.estado_gestao='disponivel' "
      + "AND m.tipo IN ('pdf','video') AND c.ativo=1";
    const [totais] = await pool.execute(
      "SELECT COUNT(*) AS total FROM historico_materiais_usuario h "
      + "INNER JOIN materiais m ON m.id=h.material_id INNER JOIN categorias c ON c.id=m.categoria_id WHERE " + condicoes,
      [usuarioId]
    );
    const [registros] = await pool.execute(
      "SELECT m.id,m.nome,m.tipo,h.ultima_acao,h.atualizado_em FROM historico_materiais_usuario h "
      + "INNER JOIN materiais m ON m.id=h.material_id INNER JOIN categorias c ON c.id=m.categoria_id WHERE " + condicoes
      + " ORDER BY h.atualizado_em DESC,m.id DESC LIMIT ? OFFSET ?",
      [usuarioId, filtros.limite, (filtros.pagina - 1) * filtros.limite]
    );
    return { itens: registros, total: Number(totais[0].total) };
  }
  return { listar: listar };
}

module.exports = criarHistoricoAlunoRepository;
