import React, { useEffect, useRef, useState } from "react";
import { listarAvisos } from "./api.js";

export default function FaixaAvisos({ avisos: avisosFornecidos }) {
  const [avisosCarregados, definirAvisosCarregados] = useState([]);
  const [paginaOculta, definirPaginaOculta] = useState(document.hidden);
  const [larguraJanela, definirLarguraJanela] = useState(0);
  const janelaRef = useRef(null);
  const grupoRef = useRef(null);
  const [larguraBase, definirLarguraBase] = useState(0);
  const repeticoes = larguraBase > 0 ? Math.max(1, Math.ceil(larguraJanela / larguraBase)) : 1;

  useEffect(() => {
    if (avisosFornecidos !== undefined) return undefined;
    let ativo = true;
    listarAvisos().then(resposta => {
      if (ativo) definirAvisosCarregados(resposta.avisos || []);
    }).catch(() => { if (ativo) definirAvisosCarregados([]); });
    return () => { ativo = false; };
  }, [avisosFornecidos]);

  useEffect(() => {
    const atualizar = () => definirPaginaOculta(document.hidden);
    document.addEventListener("visibilitychange", atualizar);
    return () => document.removeEventListener("visibilitychange", atualizar);
  }, []);

  useEffect(() => {
    if (!janelaRef.current) return undefined;
    const observador = new ResizeObserver(entradas => definirLarguraJanela(entradas[0].contentRect.width));
    observador.observe(janelaRef.current);
    const medirGrupo = new ResizeObserver(() => definirLarguraBase(grupoRef.current.getBoundingClientRect().width / repeticoes));
    medirGrupo.observe(grupoRef.current);
    return () => { observador.disconnect(); medirGrupo.disconnect(); };
  }, [avisosFornecidos, avisosCarregados, repeticoes]);

  const avisos = avisosFornecidos === undefined ? avisosCarregados : avisosFornecidos;
  if (!avisos.length) return null;
  const duracao = Math.max(22, larguraBase * repeticoes / 40);

  function itens(copia = false) {
    return Array.from({ length: repeticoes }, (_, repeticao) => avisos.map(aviso => <li key={`${repeticao}-${aviso.id}`} className="faixa-avisos-item" aria-hidden={copia || repeticao > 0 ? true : undefined}>
      <span className="faixa-avisos-separador" aria-hidden="true" />{aviso.url
        ? <a className="faixa-avisos-link" href={aviso.url} tabIndex={copia || repeticao > 0 ? -1 : undefined} target="_blank" rel="noopener noreferrer" aria-label={aviso.texto + " (abre em nova aba)"}>{aviso.texto}<span aria-hidden="true"> ↗</span></a>
        : aviso.texto}
    </li>));
  }

  return <section className="faixa-avisos" aria-label="Avisos da biblioteca" data-pausada={paginaOculta ? "true" : "false"}
    style={{ "--duracao-avisos": duracao + "s", "--largura-avisos": larguraJanela + "px" }}>
    <strong className="faixa-avisos-rotulo">Avisos</strong>
    <div className="faixa-avisos-janela" ref={janelaRef}>
      <div className="faixa-avisos-trilho">
        <ul className="faixa-avisos-grupo" ref={grupoRef} aria-live="off">{itens()}</ul>
        <ul className="faixa-avisos-grupo faixa-avisos-copia" aria-hidden="true">{itens(true)}</ul>
      </div>
    </div>
  </section>;
}
