import React, { useEffect, useRef, useState } from "react";
import { registrarPwa } from "./registro.js";

function estaInstalado() {
  return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

function eIosOuIpad() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export default function InstalacaoPwa() {
  const [instalado, definirInstalado] = useState(estaInstalado);
  const [convite, definirConvite] = useState(null);
  const [novaVersao, definirNovaVersao] = useState(null);
  const [dispensado, definirDispensado] = useState(false);
  const atualizacaoSolicitada = useRef(false);
  const ios = eIosOuIpad();

  useEffect(() => {
    const aoConvidar = (evento) => {
      evento.preventDefault();
      definirConvite(evento);
      definirDispensado(false);
    };
    const aoInstalar = () => { definirInstalado(true); definirConvite(null); };
    const aoMudarExibicao = () => definirInstalado(estaInstalado());
    const aoMudarControle = () => {
      if (atualizacaoSolicitada.current) window.location.reload();
    };
    const media = window.matchMedia("(display-mode: standalone)");
    const pararRegistro = registrarPwa(definirNovaVersao);
    window.addEventListener("beforeinstallprompt", aoConvidar);
    window.addEventListener("appinstalled", aoInstalar);
    navigator.serviceWorker?.addEventListener("controllerchange", aoMudarControle);
    media.addEventListener("change", aoMudarExibicao);
    return () => {
      pararRegistro();
      window.removeEventListener("beforeinstallprompt", aoConvidar);
      window.removeEventListener("appinstalled", aoInstalar);
      navigator.serviceWorker?.removeEventListener("controllerchange", aoMudarControle);
      media.removeEventListener("change", aoMudarExibicao);
    };
  }, []);

  async function instalar() {
    if (!convite) return;
    await convite.prompt();
    await convite.userChoice;
    definirConvite(null);
  }

  function atualizar() {
    if (!novaVersao) return;
    atualizacaoSolicitada.current = true;
    novaVersao.postMessage({ tipo: "ATIVAR_NOVA_VERSAO" });
  }

  if (novaVersao) {
    return <aside className="aviso-pwa" aria-live="polite">
      <span>Nova versão do Plantel Listas disponível.</span>
      <button type="button" onClick={atualizar}>Atualizar</button>
      <button type="button" className="aviso-pwa-fechar" onClick={() => definirNovaVersao(null)} aria-label="Dispensar aviso de atualização">×</button>
    </aside>;
  }

  if (instalado || dispensado || (!convite && !ios)) return null;

  return <aside className="aviso-pwa" aria-label="Instalação do Plantel Listas">
    {convite ? <>
      <span>Tenha o Plantel Listas na tela inicial.</span>
      <button type="button" onClick={instalar}>Instalar Plantel Listas</button>
    </> : <span>Para instalar o Plantel Listas no Safari: Compartilhar → Adicionar à Tela de Início.</span>}
    <button type="button" className="aviso-pwa-fechar" onClick={() => definirDispensado(true)} aria-label="Dispensar orientação de instalação">×</button>
  </aside>;
}
