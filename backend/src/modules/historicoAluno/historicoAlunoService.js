const { validarConsulta } = require("./historicoAlunoValidator");

function criarHistoricoAlunoService(repository) {
  async function listar(usuario, query) {
    const filtros = validarConsulta(query || {});
    const resultado = await repository.listar(usuario.id, filtros);
    return {
      itens: resultado.itens.map(function mapear(item) {
        return {
          material: { id: Number(item.id), nome: item.nome, tipo: item.tipo },
          acao: item.ultima_acao,
          dataHora: item.atualizado_em
        };
      }),
      paginacao: {
        pagina: filtros.pagina,
        limite: filtros.limite,
        total: resultado.total,
        totalPaginas: Math.max(1, Math.ceil(resultado.total / filtros.limite))
      }
    };
  }
  return { listar: listar };
}

module.exports = criarHistoricoAlunoService;
