export const LIMITE_ARQUIVOS = 10;

export function criarFila(formulario) {
  const arquivos = formulario.getAll("arquivo");
  if (!arquivos.length || arquivos.some(arquivo => !(arquivo instanceof Blob) || !arquivo.size)) throw new Error("Selecione pelo menos um arquivo.");
  if (arquivos.length > LIMITE_ARQUIVOS) throw new Error(`Selecione no máximo ${LIMITE_ARQUIVOS} arquivos por vez.`);
  return arquivos.map(arquivo => {
    const dados = new FormData();
    for (const [chave, valor] of formulario) if (chave !== "arquivo") dados.set(chave, valor);
    dados.set("arquivo", arquivo);
    if (arquivos.length > 1) dados.delete("nome");
    return { nome: arquivo.name, dados, estado: "aguardando" };
  });
}

export async function enviarFila(fila, enviar, atualizar) {
  for (const item of fila) {
    if (item.estado === "concluido") continue;
    item.estado = "enviando"; atualizar([...fila]);
    let sucesso = false;
    try { sucesso = await enviar(item.dados); }
    finally { item.estado = sucesso ? "concluido" : "interrompido"; atualizar([...fila]); }
    if (!sucesso) return false;
  }
  return true;
}
