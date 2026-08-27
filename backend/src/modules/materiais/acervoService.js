const AppError = require("../../shared/errors/AppError");
const {
  validarConsulta,
  validarMaterialId,
  validarClassificacao
} = require("./acervoValidator");

function criarAcervoService(dependencias) {
  const repository = dependencias.repository;
  const provider = dependencias.provider;
  const integracaoService = dependencias.integracaoService;

  async function consultar(query) {
    const filtros = validarConsulta(query || {});
    if (filtros.categoriaId) {
      const categoria = await repository.buscarCategoria(filtros.categoriaId);
      if (!categoria) {
        throw new AppError("Pasta nao encontrada", 404, "PASTA_NAO_ENCONTRADA");
      }
    }
    const resultados = await Promise.all([
      repository.listarBreadcrumb(filtros.categoriaId),
      filtros.busca ? Promise.resolve([]) : repository.listarPastas(filtros.categoriaId),
      repository.listarMateriais(filtros),
      repository.listarFiltros(),
      repository.contarNaoClassificados()
    ]);
    const totalPaginas = Math.max(1, Math.ceil(resultados[2].total / filtros.limite));
    return {
      breadcrumb: resultados[0],
      pastas: resultados[1],
      materiais: resultados[2].itens,
      paginacao: {
        pagina: filtros.pagina,
        limite: filtros.limite,
        totalItens: resultados[2].total,
        totalPaginas: totalPaginas
      },
      filtros: resultados[3],
      naoClassificados: resultados[4]
    };
  }

  function validarRange(range, tamanho) {
    if (!range) {
      return null;
    }
    const correspondencia = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!correspondencia || (!correspondencia[1] && !correspondencia[2])) {
      const erro = new AppError("Intervalo de arquivo invalido", 416, "RANGE_INVALIDO");
      erro.tamanhoTotal = tamanho;
      throw erro;
    }
    if (tamanho !== null && tamanho !== undefined) {
      const inicio = correspondencia[1] ? Number(correspondencia[1]) : null;
      const fim = correspondencia[2] ? Number(correspondencia[2]) : null;
      if ((inicio !== null && inicio >= Number(tamanho))
          || (inicio !== null && fim !== null && inicio > fim)) {
        const erro = new AppError("Intervalo de arquivo invalido", 416, "RANGE_INVALIDO");
        erro.tamanhoTotal = tamanho;
        throw erro;
      }
    }
    return range;
  }

  async function obterArquivo(materialIdInformado, range) {
    const materialId = validarMaterialId(materialIdInformado);
    const material = await repository.buscarMaterialDisponivel(materialId);
    if (!material) {
      throw new AppError("Material nao encontrado ou indisponivel", 404, "MATERIAL_INDISPONIVEL");
    }
    const intervalo = validarRange(range, material.tamanho_bytes);
    const refreshToken = await integracaoService.obterRefreshTokenParaUso();
    try {
      const resposta = await provider.obterConteudoArquivo(
        refreshToken,
        material.drive_file_id,
        intervalo
      );
      if (resposta.status === 416) {
        const erro = new AppError("Intervalo de arquivo invalido", 416, "RANGE_INVALIDO");
        erro.tamanhoTotal = material.tamanho_bytes;
        throw erro;
      }
      return { material: material, resposta: resposta };
    } catch (erro) {
      if (erro.codigo === "GOOGLE_AUTORIZACAO_INVALIDA") {
        await integracaoService.registrarFalhaDeAutorizacao(erro.codigo);
      }
      throw erro;
    }
  }

  async function classificarPasta(categoriaIdInformado, corpo) {
    const categoriaId = validarMaterialId(categoriaIdInformado);
    const dados = validarClassificacao(corpo);
    const categoria = await repository.buscarCategoria(categoriaId);
    if (!categoria) {
      throw new AppError("Pasta nao encontrada", 404, "PASTA_NAO_ENCONTRADA");
    }
    await repository.atualizarClassificacaoCategoria(categoriaId, dados);
    return { atualizada: true };
  }

  return {
    consultar: consultar,
    obterArquivo: obterArquivo,
    classificarPasta: classificarPasta
  };
}

module.exports = criarAcervoService;
