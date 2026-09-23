const AppError = require("../../shared/errors/AppError");
const { validarId, validarDados, validarImagem } = require("./parceiroValidator");

function criarParceiroService(repository, auditoriaRepository) {
  function publico(registro) {
    return {
      id: Number(registro.id),
      nome: registro.nome,
      descricao: registro.descricao,
      link: registro.link,
      cupom: registro.cupom,
      desconto: registro.desconto,
      textoBotao: registro.textoBotao,
      ativo: Boolean(registro.ativo),
      ordem: Number(registro.ordem),
      imagemUrl: registro.temImagem
        ? "/api/parceiros/" + registro.id + "/imagem?v=" + new Date(registro.imagemAtualizadaEm).getTime()
        : null
    };
  }

  async function listar(apenasAtivos) {
    return (await repository.listar(apenasAtivos)).map(publico);
  }

  async function exigir(id, executor, bloquear) {
    const registro = await repository.buscar(validarId(id), executor, bloquear);
    if (!registro) throw new AppError("Parceiro nao encontrado", 404, "PARCEIRO_NAO_ENCONTRADO");
    return registro;
  }

  async function registrar(conexao, atorId, acao, id) {
    await auditoriaRepository.registrar({ atorUsuarioId: atorId, acao, entidade: "parceiro", entidadeId: id }, conexao);
  }

  async function criar(corpo, atorId) {
    const dados = validarDados(corpo, false);
    const registro = await repository.comTransacao(async conexao => {
      const novoId = await repository.criar(dados, conexao);
      await registrar(conexao, atorId, "parceiro_criado", novoId);
      return exigir(novoId, conexao);
    });
    return publico(registro);
  }

  async function editar(idInformado, corpo, atorId) {
    const id = validarId(idInformado);
    const alteracoes = validarDados(corpo, true);
    const registro = await repository.comTransacao(async conexao => {
      const anterior = await exigir(id, conexao, true);
      const dados = Object.assign({}, anterior, alteracoes);
      await repository.atualizar(id, dados, conexao);
      await registrar(conexao, atorId, "parceiro_editado", id);
      return exigir(id, conexao);
    });
    return publico(registro);
  }

  async function alterarImagem(idInformado, arquivo, atorId) {
    const id = validarId(idInformado);
    const mime = validarImagem(arquivo);
    const registro = await repository.comTransacao(async conexao => {
      await exigir(id, conexao, true);
      await repository.atualizarImagem(id, mime, arquivo.buffer, conexao);
      await registrar(conexao, atorId, "parceiro_imagem_alterada", id);
      return exigir(id, conexao);
    });
    return publico(registro);
  }

  async function removerImagem(idInformado, atorId) {
    const id = validarId(idInformado);
    const registro = await repository.comTransacao(async conexao => {
      await exigir(id, conexao, true);
      await repository.atualizarImagem(id, null, null, conexao);
      await registrar(conexao, atorId, "parceiro_imagem_removida", id);
      return exigir(id, conexao);
    });
    return publico(registro);
  }

  async function obterImagem(idInformado, usuario) {
    const id = validarId(idInformado);
    const imagem = await repository.buscarImagem(id);
    if (!imagem || (!imagem.ativo && usuario.papel !== "admin") || !imagem.dados) {
      throw new AppError("Imagem nao encontrada", 404, "IMAGEM_NAO_ENCONTRADA");
    }
    return imagem;
  }

  return { listar, criar, editar, alterarImagem, removerImagem, obterImagem };
}

module.exports = criarParceiroService;
