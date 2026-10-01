function normalizar(valor) {
  return String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

export function obterOpcoesPastas(pastas, busca, valor, limite = 80) {
  const termo = normalizar(busca.trim());
  const encontradas = pastas.filter(pasta => !termo || normalizar(pasta.caminho || pasta.nome).includes(termo));
  const opcoes = encontradas.slice(0, limite);
  const selecionada = pastas.find(pasta => String(pasta.id) === String(valor));
  if (selecionada && !opcoes.some(pasta => pasta.id === selecionada.id)) opcoes.unshift(selecionada);
  return { opcoes, total: encontradas.length, exibidas: Math.min(limite, encontradas.length) };
}
