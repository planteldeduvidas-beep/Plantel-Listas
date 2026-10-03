import React from "react";

// Valores e rótulos sempre visíveis: não dependem de hover no celular/PWA.
export default function GraficoBarras({ dados, unidade = "ocorrências" }) {
  const maximo = Math.max(1, ...dados.map(item => Number(item.quantidade) || 0));
  if (!dados.length) return <p className="texto-apoio">Nenhum registro no período selecionado.</p>;
  return <ol className="analytics-barras">{dados.map((item, indice) => <li key={indice}>
    <div><span>{item.nome}</span><strong>{Number(item.quantidade).toLocaleString("pt-BR")} <small>{unidade}</small></strong></div>
    <span className="analytics-trilho" aria-hidden="true"><i style={{ width: `${Math.max(0, Number(item.quantidade)) / maximo * 100}%` }} /></span>
    {item.detalhe && <small>{item.detalhe}</small>}
  </li>)}</ol>;
}
