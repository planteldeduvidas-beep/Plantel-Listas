import React, { useState } from "react";
import { obterOpcoesPastas } from "./opcoesPastas.js";

export default function SeletorPasta({ rotulo, pastas, valor, aoAlterar, nome, obrigatorio = false, opcaoVazia = "Escolha uma pasta" }) {
  const [busca, definirBusca] = useState("");
  const { opcoes, total } = obterOpcoesPastas(pastas, busca, valor);

  return <div className="seletor-pasta">
    <label><span>Localizar pasta</span><input type="search" value={busca} placeholder="Digite nome ou caminho da pasta" onChange={function mudar(evento) { definirBusca(evento.target.value); }} autoComplete="off" /></label>
    <label><span>{rotulo}</span><select name={nome} required={obrigatorio} value={valor} onChange={function mudar(evento) { aoAlterar(evento.target.value); }}>
      <option value="" disabled={obrigatorio}>{opcaoVazia}</option>
      {opcoes.map(function opcao(pasta) { return <option key={pasta.id} value={pasta.id}>{pasta.caminho || pasta.nome}</option>; })}
    </select></label>
    <small aria-live="polite">{total + (total === 1 ? " pasta encontrada" : " pastas encontradas")} · Ordem alfabética pelo nome. O caminho identifica a localização.</small>
  </div>;
}
