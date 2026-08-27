const AppError = require("../../shared/errors/AppError");

const ORDENACOES = {
  nome_asc: "nome_asc",
  nome_desc: "nome_desc",
  recente: "recente"
};

function lerInteiroPositivo(valor, nome, opcional) {
  if ((valor === undefined || valor === "") && opcional) {
    return null;
  }
  if (!/^\d+$/.test(String(valor || "")) || Number(valor) < 1) {
    throw new AppError(nome + " invalido", 400, "PARAMETRO_INVALIDO");
  }
  return Number(valor);
}

function validarConsulta(query) {
  const permitidos = [
    "categoriaId", "pagina", "limite", "busca", "tipo",
    "disciplinaId", "concursoId", "ordenar"
  ];
  Object.keys(query || {}).forEach(function validarCampo(campo) {
    if (!permitidos.includes(campo)) {
      throw new AppError("Parametro nao permitido", 400, "MASS_ASSIGNMENT_RECUSADO");
    }
  });

  const pagina = lerInteiroPositivo(query.pagina || "1", "Pagina", false);
  const limite = lerInteiroPositivo(query.limite || "24", "Limite", false);
  const busca = typeof query.busca === "string" ? query.busca.trim() : "";
  const tipo = query.tipo || "";
  const ordenar = query.ordenar || "nome_asc";

  if (pagina > 100000 || limite > 60 || busca.length > 120) {
    throw new AppError("Consulta invalida", 400, "PARAMETRO_INVALIDO");
  }
  if (tipo && !["pdf", "video"].includes(tipo)) {
    throw new AppError("Tipo de arquivo invalido", 400, "PARAMETRO_INVALIDO");
  }
  if (!ORDENACOES[ordenar]) {
    throw new AppError("Ordenacao invalida", 400, "PARAMETRO_INVALIDO");
  }

  return {
    categoriaId: lerInteiroPositivo(query.categoriaId, "Pasta", true),
    pagina: pagina,
    limite: limite,
    busca: busca,
    tipo: tipo || null,
    disciplinaId: lerInteiroPositivo(query.disciplinaId, "Disciplina", true),
    concursoId: lerInteiroPositivo(query.concursoId, "Concurso", true),
    ordenar: ordenar
  };
}

function validarMaterialId(valor) {
  return lerInteiroPositivo(valor, "Material", false);
}

function validarClassificacao(corpo) {
  const dados = corpo || {};
  const permitidos = ["disciplina", "concurso"];
  Object.keys(dados).forEach(function validarCampo(campo) {
    if (!permitidos.includes(campo)) {
      throw new AppError("Campo nao permitido", 400, "MASS_ASSIGNMENT_RECUSADO");
    }
  });
  if (!dados.disciplina && !dados.concurso) {
    throw new AppError("Classificacao incompleta", 400, "DADOS_INVALIDOS");
  }
  const resultado = {};
  ["disciplina", "concurso"].forEach(function validarDimensao(dimensao) {
    if (!dados[dimensao]) {
      return;
    }
    const valor = dados[dimensao];
    if (typeof valor !== "object" || Array.isArray(valor)
        || Object.keys(valor).some(function campo(chave) { return !["estado", "id"].includes(chave); })
        || !["herdar", "definida", "nao_se_aplica"].includes(valor.estado)) {
      throw new AppError("Classificacao invalida", 400, "DADOS_INVALIDOS");
    }
    if (valor.estado === "definida") {
      resultado[dimensao] = { estado: valor.estado, id: lerInteiroPositivo(valor.id, dimensao, false) };
    } else {
      if (Object.prototype.hasOwnProperty.call(valor, "id") && valor.id !== null) {
        throw new AppError("Classificacao invalida", 400, "DADOS_INVALIDOS");
      }
      resultado[dimensao] = { estado: valor.estado, id: null };
    }
  });
  return resultado;
}

function validarClassificacaoEmLote(corpo) {
  const dados = corpo || {};
  if (Object.keys(dados).some(function campo(chave) {
    return !["categoriaIds", "disciplina", "concurso"].includes(chave);
  }) || !Array.isArray(dados.categoriaIds) || dados.categoriaIds.length < 1 || dados.categoriaIds.length > 100) {
    throw new AppError("Selecao de pastas invalida", 400, "DADOS_INVALIDOS");
  }
  const ids = [...new Set(dados.categoriaIds.map(function mapear(id) {
    return lerInteiroPositivo(id, "Pasta", false);
  }))];
  const classificacao = validarClassificacao({ disciplina: dados.disciplina, concurso: dados.concurso });
  return { categoriaIds: ids, disciplina: classificacao.disciplina, concurso: classificacao.concurso };
}

module.exports = {
  validarConsulta: validarConsulta,
  validarMaterialId: validarMaterialId,
  validarClassificacao: validarClassificacao,
  validarClassificacaoEmLote: validarClassificacaoEmLote
};
