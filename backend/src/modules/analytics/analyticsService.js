const { validarQuery } = require("./analyticsValidator");
const crypto = require("node:crypto");

function numero(valor) { return Number(valor || 0); }

function criarAnalyticsService(repository) {
  async function registrarUso(usuario, materialId, tipo) {
    const agora = new Date();
    const intervalo = tipo === "visualizacao"
      ? agora.toISOString().slice(0, 10)
      : agora.toISOString().slice(0, 16);
    const chave = [tipo, usuario.id, materialId, intervalo].join(":");
    await repository.registrarUso(usuario, materialId, tipo, chave);
  }

  async function registrarConsulta(usuarioId, filtros) {
    const agora = new Date();
    const hora = agora.toISOString().slice(0, 13);
    await repository.registrarConsulta(usuarioId, filtros.categoriaId, null, ["acesso", usuarioId, filtros.categoriaId || "raiz", hora].join(":"), "acesso");
    if (filtros.busca) {
      const termo = filtros.busca.toLocaleLowerCase("pt-BR");
      const hash = crypto.createHash("sha256").update(termo).digest("hex").slice(0, 24);
      await repository.registrarConsulta(usuarioId, filtros.categoriaId, termo, ["busca", usuarioId, hash, agora.toISOString().slice(0, 10)].join(":"), "busca");
    }
  }

  async function obterPainel(query) {
    const filtros = validarQuery(query || {});
    const resultados = await Promise.all([
      repository.resumo(), repository.porDisciplina(), repository.porConcurso(),
      repository.evolucao(filtros.periodo), repository.maisUsados(filtros.periodo),
      repository.recentes(), repository.atividade(filtros.periodo), repository.buscas(filtros.periodo), repository.pastasMaisAcessadas(filtros.periodo)
    ]);
    return {
      periodo: filtros.periodo,
      resumo: {
        materiais: numero(resultados[0].materiais.total),
        pdfs: numero(resultados[0].materiais.pdfs),
        videos: numero(resultados[0].materiais.videos),
        usuarios: numero(resultados[0].usuarios.total),
        alunos: numero(resultados[0].usuarios.alunos),
        professores: numero(resultados[0].usuarios.professores),
        administradores: numero(resultados[0].usuarios.administradores),
        usuariosAtivos: numero(resultados[0].usuarios.ativos)
      },
      materiaisPorDisciplina: resultados[1].map(function mapear(item) { return { nome: item.nome, quantidade: numero(item.quantidade) }; }),
      materiaisPorConcurso: resultados[2].map(function mapear(item) { return { nome: item.nome, quantidade: numero(item.quantidade) }; }),
      evolucao: resultados[3].map(function mapear(item) { return { dia: item.dia, acessos: numero(item.acessos), alunosAtivos: numero(item.alunos_ativos), visualizacoes: numero(item.visualizacoes), downloads: numero(item.downloads) }; }),
      materiaisMaisUsados: resultados[4].map(function mapear(item) { return { id: Number(item.id), nome: item.nome, visualizacoes: numero(item.visualizacoes), downloads: numero(item.downloads), acessos: numero(item.acessos) }; }),
      materiaisRecentes: resultados[5].map(function mapear(item) { return { id: Number(item.id), nome: item.nome, tipo: item.tipo, criadoEm: item.criado_em }; }),
      atividadeDoAcervo: resultados[6].map(function mapear(item) { return { acao: item.operacao, quantidade: numero(item.quantidade) }; }),
      termosMaisPesquisados: resultados[7].map(function mapear(item) { return { termo: item.termo, quantidade: numero(item.quantidade) }; }),
      pastasMaisAcessadas: resultados[8].map(function mapear(item) { return { nome: item.nome, quantidade: numero(item.quantidade) }; })
    };
  }

  async function gerarCsv(query) {
    const painel = await obterPainel(query);
    const linhas = [["Indicador", "Valor"], ["Materiais", painel.resumo.materiais], ["PDFs", painel.resumo.pdfs], ["Videos", painel.resumo.videos], ["Usuarios", painel.resumo.usuarios], ["Alunos", painel.resumo.alunos], ["Professores", painel.resumo.professores]];
    return linhas.map(function linha(itens) {
      return itens.map(function campo(valor) { return '"' + String(valor).replace(/"/g, '""') + '"'; }).join(",");
    }).join("\r\n") + "\r\n";
  }

  async function executarRetencao(configuracao) {
    const limite = new Date();
    limite.setUTCHours(0, 0, 0, 0);
    limite.setUTCDate(limite.getUTCDate() - configuracao.retencaoEventosDias);
    return repository.consolidarEventosAnteriores(limite, configuracao.loteRetencao);
  }

  return { registrarUso: registrarUso, registrarConsulta: registrarConsulta, obterPainel: obterPainel, gerarCsv: gerarCsv, executarRetencao: executarRetencao };
}

module.exports = criarAnalyticsService;
