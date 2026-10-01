function normalizar(valor) {
  return String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

export function obterOpcoesPastas(pastas, busca, valor) {
  const termo = normalizar(busca.trim());
  const encontradas = pastas.filter(pasta => !termo || normalizar(pasta.caminho || pasta.nome).includes(termo));
  const opcoes = encontradas.slice();
  const selecionada = pastas.find(pasta => String(pasta.id) === String(valor));
  if (selecionada && !opcoes.some(pasta => pasta.id === selecionada.id)) opcoes.unshift(selecionada);
  const comparar = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true }).compare;
  opcoes.sort((a, b) => comparar(a.nome, b.nome) || comparar(a.caminho || a.nome, b.caminho || b.nome) || Number(a.id) - Number(b.id));
  return { opcoes, total: encontradas.length };
}
