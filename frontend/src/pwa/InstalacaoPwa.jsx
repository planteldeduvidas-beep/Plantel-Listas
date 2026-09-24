import React, { useEffect, useRef, useState } from "react";
import {
  consumirConviteDeInstalacao,
  observarConviteDeInstalacao,
  registrarPwa
} from "./registro.js";

function estaInstalado() {
  return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

function eIosOuIpad() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function eSafari() {
  return /^((?!chrome|android|crios|fxios|edgios).)*safari/i.test(navigator.userAgent);
}

function eAndroid() {
  return /Android/i.test(navigator.userAgent);
}

function eFirefox() {
  return /Firefox|FxiOS/i.test(navigator.userAgent);
}

function instrucaoManual(ios) {
  if (ios) {
    return eSafari()
      ? "No Safari, toque em Compartilhar e depois em Adicionar à Tela de Início."
      : "No iPhone ou iPad, abra este site no Safari e use Compartilhar → Adicionar à Tela de Início.";
  }
  if (eFirefox()) {
    if (eAndroid()) return "No Firefox para Android, toque no menu ⋮ e escolha Instalar ou Adicionar à tela inicial.";
    if (/Windows/i.test(navigator.userAgent)) return "No Firefox para Windows, clique no ícone de aplicativos web na barra de endereços.";
    return "O Firefox neste sistema não oferece instalação como aplicativo. Para instalar, abra este site no Chrome ou Edge.";
  }
  if (eAndroid()) {
    return "No Chrome, toque no menu ⋮ e escolha Instalar app ou Adicionar à tela inicial.";
  }
  return "Se o navegador não abrir a confirmação, use o ícone de instalar na barra de endereço ou o menu do Chrome/Edge.";
}

export default function InstalacaoPwa() {
  const [instalado, definirInstalado] = useState(estaInstalado);
  const [convite, definirConvite] = useState(null);
  const [novaVersao, definirNovaVersao] = useState(null);
  const [dispensado, definirDispensado] = useState(false);
  const [resultadoDaInstalacao, definirResultadoDaInstalacao] = useState("");
  const [instalando, definirInstalando] = useState(false);
  const atualizacaoSolicitada = useRef(false);
  const ios = eIosOuIpad();

  useEffect(() => {
    const pararConvite = observarConviteDeInstalacao((evento) => {
      definirConvite(evento);
      if (evento) {
        definirDispensado(false);
        definirResultadoDaInstalacao("");
      }
    });
    const aoInstalar = () => {
      definirInstalado(true);
      definirConvite(null);
      definirResultadoDaInstalacao("");
    };
    const aoMudarExibicao = () => definirInstalado(estaInstalado());
    const aoMudarControle = () => {
      if (atualizacaoSolicitada.current) window.location.reload();
    };
    const media = window.matchMedia("(display-mode: standalone)");
    const pararRegistro = registrarPwa(definirNovaVersao);
    window.addEventListener("appinstalled", aoInstalar);
    navigator.serviceWorker?.addEventListener("controllerchange", aoMudarControle);
    media.addEventListener("change", aoMudarExibicao);
    return () => {
      pararRegistro();
      pararConvite();
      window.removeEventListener("appinstalled", aoInstalar);
      navigator.serviceWorker?.removeEventListener("controllerchange", aoMudarControle);
      media.removeEventListener("change", aoMudarExibicao);
    };
  }, []);

  async function instalar() {
    if (!convite) {
      definirResultadoDaInstalacao(instrucaoManual(ios));
      return;
    }
    definirInstalando(true);
    definirResultadoDaInstalacao("");
    try {
      await convite.prompt();
      const escolha = await convite.userChoice;
      consumirConviteDeInstalacao();
      if (escolha.outcome === "accepted") {
        definirResultadoDaInstalacao("Instalação confirmada. O ícone aparecerá na tela inicial ou na lista de aplicativos.");
      } else {
        definirResultadoDaInstalacao("A instalação foi cancelada. " + instrucaoManual(ios));
      }
    } catch {
      consumirConviteDeInstalacao();
      definirResultadoDaInstalacao("Não foi possível abrir a confirmação de instalação. " + instrucaoManual(ios));
    } finally {
      definirInstalando(false);
    }
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

  if (instalado || dispensado) return null;

  return <aside className="aviso-pwa" aria-label="Instalação do Plantel Listas">
    <span>{resultadoDaInstalacao || "Tenha o Plantel Listas na tela inicial do seu dispositivo."}</span>
    <button type="button" onClick={instalar} disabled={instalando}>{instalando ? "Abrindo confirmação..." : convite ? "Instalar Plantel Listas" : "Como instalar"}</button>
    <button type="button" className="aviso-pwa-fechar" onClick={() => definirDispensado(true)} aria-label="Dispensar orientação de instalação">×</button>
  </aside>;
}
