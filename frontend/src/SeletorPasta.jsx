import React, { useMemo, useState } from "react";

function normalizar(valor) {
  return String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

export default function SeletorPasta({ rotulo, pastas, valor, aoAlterar, nome, obrigatorio = false, opcaoVazia = "Escolha uma pasta" }) {
  const [busca, definirBusca] = useState("");
  const encontradas = useMemo(function filtrar() {
    const termo = normalizar(busca.trim());
    return termo ? pastas.filter(function corresponde(pasta) { return normalizar(pasta.caminho || pasta.nome).includes(termo); }) : pastas;
  }, [pastas, busca]);
  const limite = 80;
  const opcoes = encontradas.slice(0, limite);
  const selecionada = pastas.find(function mesma(pasta) { return String(pasta.id) === String(valor); });
  if (selecionada && !opcoes.some(function mesma(pasta) { return pasta.id === selecionada.id; })) opcoes.unshift(selecionada);

  return <div className="seletor-pasta">
    <label><span>Localizar pasta</span><input type="search" value={busca} placeholder="Digite nome ou caminho da pasta" onChange={function mudar(evento) { definirBusca(evento.target.value); }} autoComplete="off" /></label>
    <label><span>{rotulo}</span><select name={nome} required={obrigatorio} value={valor} onChange={function mudar(evento) { aoAlterar(evento.target.value); }}>
      <option value="" disabled={obrigatorio}>{opcaoVazia}</option>
      {opcoes.map(function opcao(pasta) { return <option key={pasta.id} value={pasta.id}>{pasta.caminho || pasta.nome}</option>; })}
    </select></label>
    <small>{encontradas.length > limite ? "Mostrando as primeiras 80 pastas. Refine a busca para encontrar a desejada." : encontradas.length + (encontradas.length === 1 ? " pasta encontrada" : " pastas encontradas")}</small>
  </div>;
}
