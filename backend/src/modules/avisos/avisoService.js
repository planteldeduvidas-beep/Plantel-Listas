const AppError = require("../../shared/errors/AppError");
const { validarId, validarDados } = require("./avisoValidator");

function criarAvisoService(repository, auditoriaRepository) {
  const publico = registro => ({
    id: Number(registro.id), texto: registro.texto, ativo: Boolean(registro.ativo), ordem: Number(registro.ordem)
  });

  async function listar(apenasAtivos) {
    return (await repository.listar(apenasAtivos)).map(publico);
  }

  async function exigir(id, conexao) {
    const aviso = await repository.buscar(id, conexao);
    if (!aviso) throw new AppError("Aviso nao encontrado", 404, "AVISO_NAO_ENCONTRADO");
    return aviso;
  }

  async function criar(corpo, atorId) {
    const dados = validarDados(corpo);
    const registro = await repository.comTransacao(async conexao => {
      const id = await repository.criar(dados, conexao);
      await auditoriaRepository.registrar({ atorUsuarioId: atorId, acao: "aviso_criado", entidade: "aviso_biblioteca", entidadeId: id }, conexao);
      return exigir(id, conexao);
    });
    return publico(registro);
  }

  async function editar(idInformado, corpo, atorId) {
    const id = validarId(idInformado);
    const alteracoes = validarDados(corpo, true);
    const registro = await repository.comTransacao(async conexao => {
      const anterior = await exigir(id, conexao);
      await repository.atualizar(id, { ...anterior, ...alteracoes }, conexao);
      await auditoriaRepository.registrar({ atorUsuarioId: atorId, acao: "aviso_editado", entidade: "aviso_biblioteca", entidadeId: id }, conexao);
      return exigir(id, conexao);
    });
    return publico(registro);
  }

  return { listar, criar, editar };
}

module.exports = criarAvisoService;
