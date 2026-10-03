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
    try {
      await repository.registrarUso(usuario, materialId, tipo, chave);
    } catch (erro) {
      if (usuario.papel === "aluno" && repository.registrarHistoricoAposFalha) {
        await repository.registrarHistoricoAposFalha(usuario, materialId, tipo)
          .catch(function preservarFalhaOriginal() {});
      }
      throw erro;
    }
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
      repository.recentes(), repository.atividade(filtros.periodo), repository.buscas(filtros.periodo), repository.pastasMaisAcessadas(filtros.periodo), repository.engajamento(filtros.periodo), repository.cobertura(filtros.periodo)
    ]);
    const evolucao = resultados[3].map(function mapear(item) { return { dia: item.dia, acessos: numero(item.acessos), alunosAtivos: numero(item.alunos_ativos), visualizacoes: numero(item.visualizacoes), downloads: numero(item.downloads) }; });
    const meses = new Map();
    for (const dia of evolucao) {
      const chave = new Date(dia.dia).toISOString().slice(0, 7);
      const total = meses.get(chave) || { mes: chave, acessos: 0, visualizacoes: 0, downloads: 0 };
      total.acessos += dia.acessos;
      total.visualizacoes += dia.visualizacoes;
      total.downloads += dia.downloads;
      meses.set(chave, total);
    }
    const alunosComNavegacao = numero(resultados[9].alunos_com_navegacao);
    const alunosComMaterial = numero(resultados[9].alunos_com_material);
    return {
      periodo: filtros.periodo,
      publico: "aluno",
      cobertura: {
        eventosComPerfilAtual: resultados[10].eventosSemPapel,
        engajamentoParcial: resultados[10].resumos.length > 0,
        historicoSemSegmentacao: resultados[10].resumos.filter(item => Number(item.sem_segmentacao)).map(item => ({ dia: item.dia, navegacoes: numero(item.acessos), aberturas: numero(item.visualizacoes), downloads: numero(item.downloads) }))
      },
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
      evolucao,
      evolucaoMensal: Array.from(meses.values()),
      engajamento: { alunosComNavegacao, alunosComMaterial, buscas: numero(resultados[9].buscas), taxaDeInteracao: alunosComNavegacao ? Math.round(numero(resultados[9].alunos_que_navegaram_e_interagiram) / alunosComNavegacao * 100) : 0 },
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
    linhas.push(["Atividade abaixo", "Somente alunos; navegacoes nao sao logins"], ["Data", "Navegacoes de alunos", "Aberturas de alunos", "Downloads de alunos", "Alunos que navegaram no dia"]);
    for (const dia of painel.evolucao) linhas.push([new Date(dia.dia).toISOString().slice(0, 10), dia.acessos, dia.visualizacoes, dia.downloads, dia.alunosAtivos]);
    linhas.push(["Termo pesquisado por alunos", "Ocorrencias"]);
    for (const item of painel.termosMaisPesquisados) linhas.push([item.termo, item.quantidade]);
    linhas.push(["Pasta acessada por alunos", "Navegacoes"]);
    for (const item of painel.pastasMaisAcessadas) linhas.push([item.nome, item.quantidade]);
    linhas.push(["Material usado por alunos", "Aberturas", "Downloads"]);
    for (const item of painel.materiaisMaisUsados) linhas.push([item.nome, item.visualizacoes, item.downloads]);
    linhas.push(["Historico preservado sem separacao de perfis - fora dos graficos de alunos"], ["Data", "Navegacoes de todos os perfis", "Aberturas de todos os perfis", "Downloads de todos os perfis"]);
    for (const dia of painel.cobertura.historicoSemSegmentacao) linhas.push([new Date(dia.dia).toISOString().slice(0, 10), dia.navegacoes, dia.aberturas, dia.downloads]);
    linhas.push(["Eventos antigos classificados pelo perfil atual", painel.cobertura.eventosComPerfilAtual], ["Engajamento de pessoas limitado aos eventos detalhados", painel.cobertura.engajamentoParcial ? "Sim" : "Nao"]);
    return linhas.map(function linha(itens) {
      return itens.map(function campo(valor) {
        const texto = String(valor);
        const seguro = /^[\s]*[=+@-]/.test(texto) ? "'" + texto : texto;
        return '"' + seguro.replace(/"/g, '""') + '"';
      }).join(",");
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
