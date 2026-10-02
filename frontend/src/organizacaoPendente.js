export function pendenciasDaSelecao(pastas, ids) {
  const selecionadas = new Set(ids);
  const escolhidas = pastas.filter(pasta => selecionadas.has(pasta.id));
  return {
    disciplina: escolhidas.some(pasta => pasta.disciplinaPendente),
    concurso: escolhidas.some(pasta => pasta.concursoPendente)
  };
}

export function validarOrganizacaoPendente(pastas, ids, disciplina, concurso) {
  if (!ids.length) return "Marque ao menos uma pasta para organizar.";
  const pendencias = pendenciasDaSelecao(pastas, ids);
  if (pendencias.disciplina && ["manter", "herdar"].includes(disciplina)) {
    return "Escolha uma disciplina ou 'Não se aplica' para concluir a organização.";
  }
  if (pendencias.concurso && ["manter", "herdar"].includes(concurso)) {
    return "Escolha um concurso ou 'Não se aplica' para concluir a organização.";
  }
  return "";
}
