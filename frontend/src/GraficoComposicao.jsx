import React from "react";

const CORES = ["#178777", "#598bc2", "#bf8847", "#8b75ba"];
export default function GraficoComposicao({ dados, unidade = "materiais" }) {
  const itens = dados.map(item => ({ ...item, quantidade: Math.max(0, Number(item.quantidade) || 0) }));
  const total = itens.reduce((soma, item) => soma + item.quantidade, 0);
  if (!total) return <p className="texto-apoio">Nenhum registro para exibir.</p>;
  let acumulado = 0;
  const segmentos = itens.map((item, indice) => {
    const inicio = acumulado;
    acumulado += item.quantidade / total * 100;
    return `${CORES[indice % CORES.length]} ${inicio}% ${acumulado}%`;
  });
  return <div className="analytics-composicao">
    <div className="analytics-anel" style={{ background: `conic-gradient(${segmentos.join(",")})` }} aria-hidden="true"><div><strong>{total.toLocaleString("pt-BR")}</strong><span>{unidade}</span></div></div>
    <ul aria-label={`Composição: ${total.toLocaleString("pt-BR")} ${unidade}`}>
      {itens.map((item, indice) => <li key={indice}><i style={{ background: CORES[indice % CORES.length] }} aria-hidden="true" /><span>{item.nome}<small>{(item.quantidade / total * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do total</small></span><strong>{item.quantidade.toLocaleString("pt-BR")}</strong></li>)}
    </ul>
  </div>;
}
