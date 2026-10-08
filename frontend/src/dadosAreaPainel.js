// Somente dados usados pela area aberta. A autorizacao continua no backend.
export async function carregarDadosArea(papel, area, api) {
  if (papel === 'professor' && area === 'minhasPastas') {
    return { minhasPermissoes: (await api.listarMinhasPermissoes()).permissoes };
  }
  if (papel !== 'admin') return {};
  if (area === 'drive') {
    const [status, changes] = await Promise.all([api.obterStatusGoogleDrive(), api.obterStatusDasAtualizacoesGoogleDrive()]);
    return { googleDrive: status.googleDrive, acompanhamento: changes.acompanhamento };
  }
  if (area === 'organizacao') {
    const [categorias, disciplinas, concursos] = await Promise.all([api.categorias.listar(), api.disciplinas.listar(), api.concursos.listar()]);
    return { categorias: categorias.categorias, disciplinas: disciplinas.disciplinas, concursos: concursos.concursos };
  }
  if (area === 'acessos') {
    const [categorias, disciplinas, usuarios, permissoes, vinculos] = await Promise.all([
      api.categorias.listar(), api.disciplinas.listar(),
      api.listarUsuarios({ papel: 'professor', ativo: true, limite: 100 }),
      api.listarPermissoes(), api.listarDisciplinasDosProfessores()
    ]);
    return { categorias: categorias.categorias, disciplinas: disciplinas.disciplinas, usuarios: usuarios.usuarios,
      permissoes: permissoes.permissoes, disciplinasDosProfessores: vinculos.disciplinas };
  }
  return {};
}
