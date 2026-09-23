import React, { useEffect, useState } from "react";
import { listarParceiros } from "./api.js";

export default function ParceirosSidebar({ versao }) {
  const [parceiros, definirParceiros] = useState([]);
  const [indice, definirIndice] = useState(0);
  const [pausado, definirPausado] = useState(false);
  const [paginaOculta, definirPaginaOculta] = useState(document.hidden);
  const [movimentoReduzido, definirMovimentoReduzido] = useState(false);
  const [imagemFalhou, definirImagemFalhou] = useState(false);
  const [feedback, definirFeedback] = useState("");
  const [direcao, definirDirecao] = useState("proximo");

  useEffect(() => {
    let ativo = true;
    listarParceiros().then(dados => {
      if (ativo) {
        definirParceiros(dados.parceiros || []);
        definirIndice(0);
      }
    }).catch(() => { if (ativo) definirParceiros([]); });
    return () => { ativo = false; };
  }, [versao]);

  useEffect(() => {
    const consulta = window.matchMedia("(prefers-reduced-motion: reduce)");
    const atualizar = () => definirMovimentoReduzido(consulta.matches);
    atualizar();
    consulta.addEventListener("change", atualizar);
    return () => consulta.removeEventListener("change", atualizar);
  }, []);

  useEffect(() => {
    if (parceiros.length < 2 || pausado || movimentoReduzido || paginaOculta) return undefined;
    const temporizador = window.setTimeout(() => {
      definirDirecao("proximo");
      definirIndice(atual => (atual + 1) % parceiros.length);
    }, 6500);
    return () => window.clearTimeout(temporizador);
  }, [parceiros.length, indice, pausado, movimentoReduzido, paginaOculta]);

  useEffect(() => {
    const atualizar = () => definirPaginaOculta(document.hidden);
    document.addEventListener("visibilitychange", atualizar);
    return () => document.removeEventListener("visibilitychange", atualizar);
  }, []);

  useEffect(() => { definirImagemFalhou(false); definirFeedback(""); }, [indice, parceiros]);

  if (!parceiros.length) return null;
  const parceiro = parceiros[indice] || parceiros[0];
  const mudar = deslocamento => {
    definirDirecao(deslocamento > 0 ? "proximo" : "anterior");
    definirIndice(atual => (atual + deslocamento + parceiros.length) % parceiros.length);
  };

  function escolher(posicao) {
    if (posicao === indice) return;
    definirDirecao(posicao > indice ? "proximo" : "anterior");
    definirIndice(posicao);
  }

  async function copiarCupom() {
    try {
      await navigator.clipboard.writeText(parceiro.cupom);
      definirFeedback("Cupom copiado");
    } catch {
      definirFeedback("Não foi possível copiar");
    }
  }

  return (
    <section className="parceiros-sidebar" aria-label="Parceiros Plantel"
      onMouseEnter={() => definirPausado(true)} onMouseLeave={() => definirPausado(false)}
      onFocus={() => definirPausado(true)}
      onBlur={evento => { if (!evento.currentTarget.contains(evento.relatedTarget)) definirPausado(false); }}>
      <span className="parceiros-sidebar-rotulo">Parceiros Plantel</span>
      <div className="parceiros-sidebar-vitrine">
      <div className={"parceiros-sidebar-conteudo entrando-" + direcao} key={parceiro.id}>
        <a className="parceiros-sidebar-imagem" href={parceiro.link} target="_blank" rel="noopener noreferrer" aria-label={"Conhecer " + parceiro.nome}>
          {parceiro.imagemUrl && !imagemFalhou
            ? <img src={parceiro.imagemUrl} alt={"Logo de " + parceiro.nome} onError={() => definirImagemFalhou(true)} />
            : <span aria-hidden="true">{parceiro.nome.slice(0, 1).toUpperCase()}</span>}
        </a>
        <strong>{parceiro.nome}</strong>
        <p>{parceiro.descricao}</p>
        {(parceiro.cupom || parceiro.desconto) && <div className="parceiros-sidebar-beneficio">
          {parceiro.cupom && <button type="button" onClick={copiarCupom} title="Copiar cupom">Cupom: {parceiro.cupom}</button>}
          {parceiro.desconto && <small>{parceiro.desconto}</small>}
        </div>}
        <a className="parceiros-sidebar-link" href={parceiro.link} target="_blank" rel="noopener noreferrer">
          {parceiro.textoBotao || "Conhecer parceiro"}<span aria-hidden="true">↗</span>
        </a>
      </div>
      </div>
      <span className="parceiros-sidebar-feedback" role="status">{feedback}</span>
      {parceiros.length > 1 && <div className="parceiros-sidebar-controles">
        <button type="button" aria-label="Parceiro anterior" onClick={() => mudar(-1)}>←</button>
        <span className="parceiros-sidebar-pontos" aria-label={"Parceiro " + (indice + 1) + " de " + parceiros.length}>
          {parceiros.map((item, posicao) => <button key={item.id} type="button"
            className={posicao === indice ? "ativo" : ""} aria-label={"Mostrar " + item.nome}
            aria-current={posicao === indice ? "true" : undefined}
            onClick={() => escolher(posicao)} />)}
        </span>
        <button type="button" aria-label="Próximo parceiro" onClick={() => mudar(1)}>→</button>
      </div>}
    </section>
  );
}
