import React, { useEffect, useState } from "react";
import { obterMeuHistorico, obterUrlDoMaterial } from "./api.js";
import { Esqueleto, Icone, Vazio, mensagemHumana } from "./ComponentesInterface.jsx";

function MeuHistorico({ aoErro }) {
  const [dados, definirDados] = useState(null);
  const [pagina, definirPagina] = useState(1);

  useEffect(function carregar() {
    definirDados(null);
    obterMeuHistorico(pagina, 20).then(definirDados).catch(function falhar(erro) { aoErro(mensagemHumana(erro)); });
  }, [pagina]);

  if (!dados) return <Esqueleto linhas={5} texto="Carregando seu histórico..." />;
  return (
    <section className="bloco-admin painel-conteudo painel-meu-historico">
      <div className="cabecalho-bloco"><div><h2>Materiais vistos por você</h2><p>Encontre rapidamente o que você abriu ou baixou.</p></div></div>
      <ul className="lista-historico lista-historico-aluno">
        {dados.itens.map(function renderizar(item) {
          return <li key={item.material.id}><span className="icone-historico"><Icone nome={item.material.tipo} /></span><span><strong>{item.material.nome}</strong><small>{item.acao === "download" ? "Baixado" : item.material.tipo === "video" ? "Assistido" : "Visualizado"} · {new Date(item.dataHora).toLocaleString("pt-BR")}</small></span><a className="botao-secundario" href={obterUrlDoMaterial(item.material.id, false)} target="_blank" rel="noreferrer">Abrir novamente</a></li>;
        })}
      </ul>
      {!dados.itens.length && <Vazio titulo="Seu histórico está vazio" texto="Os materiais que você abrir ou baixar aparecerão aqui." />}
      {dados.paginacao.totalPaginas > 1 && <nav className="paginacao" aria-label="Páginas do histórico"><button type="button" className="secundario" disabled={pagina === 1} onClick={function anterior() { definirPagina(pagina - 1); }}>Anterior</button><span>Página <strong>{pagina}</strong> de {dados.paginacao.totalPaginas}</span><button type="button" className="secundario" disabled={pagina >= dados.paginacao.totalPaginas} onClick={function proxima() { definirPagina(pagina + 1); }}>Próxima</button></nav>}
    </section>
  );
}

export default MeuHistorico;
