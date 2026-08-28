const { validarConsulta } = require("./auditoriaValidator");

function criarAuditoriaService(repository) {
  async function consultar(query) {
    const filtros = validarConsulta(query || {});
    const resultados = await Promise.all([repository.listar(filtros), repository.listarAcoes()]);
    return {
      eventos: resultados[0].itens.map(function mapear(item) {
        return {
          chave: item.chave,
          acao: item.acao,
          entidade: item.entidade,
          resultado: item.resultado,
          criadoEm: item.criado_em,
          ator: item.ator_email || "Sistema",
          descricao: item.descricao
        };
      }),
      acoes: resultados[1],
      paginacao: {
        pagina: filtros.pagina,
        limite: filtros.limite,
        total: resultados[0].total,
        totalPaginas: Math.max(1, Math.ceil(resultados[0].total / filtros.limite))
      }
    };
  }
  return { consultar: consultar };
}

module.exports = criarAuditoriaService;
