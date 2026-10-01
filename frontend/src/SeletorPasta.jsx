import React, { useState } from "react";
import { obterOpcoesPastas } from "./opcoesPastas.js";

export default function SeletorPasta({ rotulo, pastas, valor, aoAlterar, nome, obrigatorio = false, opcaoVazia = "Escolha uma pasta" }) {
  const [busca, definirBusca] = useState("");
  const [limite, definirLimite] = useState(80);
  const { opcoes, total, exibidas } = obterOpcoesPastas(pastas, busca, valor, limite);

  return <div className="seletor-pasta">
    <label><span>Localizar pasta</span><input type="search" value={busca} placeholder="Digite nome ou caminho da pasta" onChange={function mudar(evento) { definirBusca(evento.target.value); definirLimite(80); }} autoComplete="off" /></label>
    <label><span>{rotulo}</span><select name={nome} required={obrigatorio} value={valor} onChange={function mudar(evento) { aoAlterar(evento.target.value); }}>
      <option value="" disabled={obrigatorio}>{opcaoVazia}</option>
      {opcoes.map(function opcao(pasta) { return <option key={pasta.id} value={pasta.id}>{pasta.caminho || pasta.nome}</option>; })}
    </select></label>
    <small aria-live="polite">{total > exibidas ? `Mostrando ${exibidas} de ${total} pastas. Busque pelo nome ou carregue mais opções.` : total + (total === 1 ? " pasta encontrada" : " pastas encontradas")}</small>
    {total > exibidas && <button type="button" className="secundario" onClick={() => definirLimite(atual => atual + 80)}>Mostrar mais pastas</button>}
  </div>;
}
