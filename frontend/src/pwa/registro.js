let conviteDeInstalacao = null;
const ouvintesDoConvite = new Set();

function avisarConvite() {
  ouvintesDoConvite.forEach(function avisar(ouvinte) {
    ouvinte(conviteDeInstalacao);
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", function guardarConvite(evento) {
    evento.preventDefault();
    conviteDeInstalacao = evento;
    avisarConvite();
  });
}

function observarConviteDeInstalacao(ouvinte) {
  ouvintesDoConvite.add(ouvinte);
  ouvinte(conviteDeInstalacao);
  return function pararObservacao() {
    ouvintesDoConvite.delete(ouvinte);
  };
}

function consumirConviteDeInstalacao() {
  conviteDeInstalacao = null;
  avisarConvite();
}

export function registrarPwa(aoAtualizar) {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator) ||
      !(location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    return () => {};
  }

  let ativo = true;
  let registro;
  let instalando;
  let intervalo;

  const avisarSeAguardando = () => {
    if (ativo && registro?.waiting && navigator.serviceWorker.controller) aoAtualizar(registro.waiting);
  };
  const acompanharInstalacao = () => {
    instalando = registro.installing;
    instalando?.addEventListener("statechange", avisarSeAguardando);
  };

  navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((novoRegistro) => {
    if (!ativo) return;
    registro = novoRegistro;
    registro.addEventListener("updatefound", acompanharInstalacao);
    avisarSeAguardando();
    intervalo = window.setInterval(() => {
      if (document.visibilityState === "visible") registro.update().catch(() => {});
    }, 30 * 60 * 1000);
  }).catch(() => {});

  return () => {
    ativo = false;
    window.clearInterval(intervalo);
    registro?.removeEventListener("updatefound", acompanharInstalacao);
    instalando?.removeEventListener("statechange", avisarSeAguardando);
  };
}

export { observarConviteDeInstalacao, consumirConviteDeInstalacao };
