import React, { useEffect, useRef, useState } from "react";
import { listarAvisos } from "./api.js";

export default function FaixaAvisos({ avisos: avisosFornecidos }) {
  const [avisosCarregados, definirAvisosCarregados] = useState([]);
  const [pausada, definirPausada] = useState(false);
  const [paginaOculta, definirPaginaOculta] = useState(document.hidden);
  const [movimentoReduzido, definirMovimentoReduzido] = useState(false);
  const [larguraJanela, definirLarguraJanela] = useState(0);
  const janelaRef = useRef(null);

  useEffect(() => {
    if (avisosFornecidos !== undefined) return undefined;
    let ativo = true;
    listarAvisos().then(resposta => {
      if (ativo) definirAvisosCarregados(resposta.avisos || []);
    }).catch(() => { if (ativo) definirAvisosCarregados([]); });
    return () => { ativo = false; };
  }, [avisosFornecidos]);

  useEffect(() => {
    const consulta = window.matchMedia("(prefers-reduced-motion: reduce)");
    const atualizar = () => definirMovimentoReduzido(consulta.matches);
    atualizar();
    consulta.addEventListener("change", atualizar);
    return () => consulta.removeEventListener("change", atualizar);
  }, []);

  useEffect(() => {
    const atualizar = () => definirPaginaOculta(document.hidden);
    document.addEventListener("visibilitychange", atualizar);
    return () => document.removeEventListener("visibilitychange", atualizar);
  }, []);

  useEffect(() => {
    if (!janelaRef.current) return undefined;
    const observador = new ResizeObserver(entradas => definirLarguraJanela(entradas[0].contentRect.width));
    observador.observe(janelaRef.current);
    return () => observador.disconnect();
  }, [avisosFornecidos, avisosCarregados]);

  const avisos = avisosFornecidos === undefined ? avisosCarregados : avisosFornecidos;
  if (!avisos.length) return null;
  const duracao = Math.max(22, Math.min(55, avisos.reduce((total, aviso) => total + aviso.texto.length, 0) * 0.22));
  const interrompida = pausada || paginaOculta;

  function itens() {
    return avisos.map(aviso => <li key={aviso.id} className="faixa-avisos-item">
      <span className="faixa-avisos-separador" aria-hidden="true" />{aviso.texto}
    </li>);
  }

  return <section className="faixa-avisos" aria-label="Avisos da biblioteca" data-pausada={interrompida ? "true" : "false"}
    style={{ "--duracao-avisos": duracao + "s", "--largura-avisos": larguraJanela + "px" }}>
    <strong className="faixa-avisos-rotulo">Avisos</strong>
    <div className="faixa-avisos-janela" ref={janelaRef}>
      <div className="faixa-avisos-trilho">
        <ul className="faixa-avisos-grupo" aria-live="off">{itens()}</ul>
        <ul className="faixa-avisos-grupo faixa-avisos-copia" aria-hidden="true">{itens()}</ul>
      </div>
    </div>
    {!movimentoReduzido && <button type="button" className="faixa-avisos-pausa"
      aria-label={pausada ? "Retomar avisos" : "Pausar avisos"} aria-pressed={pausada}
      onClick={() => definirPausada(atual => !atual)}>{pausada ? "Reproduzir" : "Pausar"}</button>}
  </section>;
}
