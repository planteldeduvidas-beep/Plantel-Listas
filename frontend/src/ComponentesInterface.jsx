import React, { useEffect, useState } from "react";

function Icone({ nome, tamanho }) {
  const dimensao = tamanho || 21;
  const propriedades = {
    className: "icone-svg glifo-" + nome,
    width: dimensao,
    height: dimensao,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.9",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true"
  };

  if (nome === "menu") return <svg {...propriedades}><path d="M4 7h16M4 12h16M4 17h16" /></svg>;
  if (nome === "fechar") return <svg {...propriedades}><path d="m6 6 12 12M18 6 6 18" /></svg>;
  if (nome === "acervo") return <svg {...propriedades}><path d="M5 4.5h4.5v15H5zM9.5 4.5H14v15H9.5zM15.5 5.5l3.4-.9L22 18.9l-3.5.8z" /><path d="M3 20h19" /></svg>;
  if (nome === "pasta") return <svg {...propriedades}><path d="M3 7.5h7l2-2h3.5a2 2 0 0 1 1.7.9l.7 1.1H21v10.8a1.7 1.7 0 0 1-1.7 1.7H4.7A1.7 1.7 0 0 1 3 18.3z" /><path d="M3 10h18" /></svg>;
  if (nome === "usuarios") return <svg {...propriedades}><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20v-1.2A4.8 4.8 0 0 1 8.3 14h1.4a4.8 4.8 0 0 1 4.8 4.8V20M15.5 5.3a3.2 3.2 0 0 1 0 6.2M17 14.2a4.8 4.8 0 0 1 3.5 4.6V20" /></svg>;
  if (nome === "acessos") return <svg {...propriedades}><path d="M12 2.8 20 6v5.3c0 4.8-3.2 8.3-8 10-4.8-1.7-8-5.2-8-10V6z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></svg>;
  if (nome === "organizacao") return <svg {...propriedades}><rect x="8.5" y="3" width="7" height="5" rx="1.4" /><rect x="3" y="16" width="7" height="5" rx="1.4" /><rect x="14" y="16" width="7" height="5" rx="1.4" /><path d="M12 8v4M6.5 16v-2a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v2" /></svg>;
  if (nome === "estatisticas") return <svg {...propriedades}><path d="M4 20V9.5h4V20M10 20V4h4v16M16 20v-7h4v7M2 20h20" /></svg>;
  if (nome === "historico") return <svg {...propriedades}><path d="M4.4 7.1A9 9 0 1 1 3 12" /><path d="M3 5v5h5M12 7.2V12l3.3 2" /></svg>;
  if (nome === "suporte") return <svg {...propriedades}><path d="M4 13v-2a8 8 0 0 1 16 0v2" /><path d="M4 12H2.8A1.8 1.8 0 0 0 1 13.8v3.4A1.8 1.8 0 0 0 2.8 19H5v-7zM20 12h1.2a1.8 1.8 0 0 1 1.8 1.8v3.4a1.8 1.8 0 0 1-1.8 1.8H19v-7zM19 19c0 1.1-.9 2-2 2h-3" /></svg>;
  if (nome === "inicio") return <svg {...propriedades}><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10M9 20v-6h6v6" /></svg>;
  if (nome === "drive") return <svg {...propriedades}><path d="m9.2 3-6 10.4 3.1 5.4L15.4 3z" /><path d="M15.4 3 21 12.7h-6.3L9.2 3M6.3 18.8h11.5l3.2-6.1H9.8z" /></svg>;
  if (nome === "sair") return <svg {...propriedades}><path d="M10 17l5-5-5-5M15 12H3M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /></svg>;
  if (nome === "buscar") return <svg {...propriedades}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>;
  if (nome === "filtros") return <svg {...propriedades}><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></svg>;
  if (nome === "opcoes") return <svg {...propriedades}><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></svg>;
  if (nome === "pdf") return <svg {...propriedades}><path d="M5 2.5h9l5 5V21.5H5z" /><path d="M14 2.5v5h5M8 16.5h2.2a1.8 1.8 0 0 0 0-3.6H8v5.3M13.5 18.2v-5.3h1.4a2.65 2.65 0 0 1 0 5.3z" /></svg>;
  if (nome === "video") return <svg {...propriedades}><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="m10 9 5 3-5 3zM6 5V3M18 5V3" /></svg>;
  if (nome === "mais") return <svg {...propriedades}><path d="M12 5v14M5 12h14" /></svg>;
  if (nome === "download") return <svg {...propriedades}><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" /></svg>;
  if (nome === "chevron") return <svg {...propriedades}><path d="m9 18 6-6-6-6" /></svg>;
  if (nome === "voltar") return <svg {...propriedades}><path d="m15 18-6-6 6-6" /></svg>;
  if (nome === "sucesso") return <svg {...propriedades}><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></svg>;
  if (nome === "alerta") return <svg {...propriedades}><path d="M10.3 3.4 2.2 18a2 2 0 0 0 1.8 3h16a2 2 0 0 0 1.8-3L13.7 3.4a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></svg>;
  if (nome === "sol") return <svg {...propriedades}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" /></svg>;
  if (nome === "lua") return <svg {...propriedades}><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 6.5 6.5 0 0 0 21 12.8z" /></svg>;
  if (nome === "online") return <svg {...propriedades}><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" /></svg>;
  return <svg {...propriedades}><circle cx="12" cy="12" r="9" /></svg>;
}

function mensagemHumana(falhaOuMensagem) {
  const mensagem = typeof falhaOuMensagem === "string"
    ? falhaOuMensagem
    : falhaOuMensagem && falhaOuMensagem.message;
  const codigo = typeof falhaOuMensagem === "object" && falhaOuMensagem
    ? falhaOuMensagem.codigo
    : null;
  const status = typeof falhaOuMensagem === "object" && falhaOuMensagem
    ? falhaOuMensagem.status
    : null;

  if (!mensagem || /failed to fetch|networkerror|fetch failed/i.test(mensagem)) {
    return "Não foi possível falar com o sistema. Verifique sua conexão e tente novamente.";
  }

  if (codigo === "API_INDISPONIVEL" || status >= 500) {
    return "O sistema está temporariamente indisponível. Tente novamente em instantes.";
  }

  if (codigo === "NAO_AUTENTICADO") {
    return "Sua sessão terminou. Entre novamente.";
  }

  const traducoes = [
    [/Usuario sem permissao|sem permissao|forbidden/i, "Você não tem acesso a essa área."],
    [/Categoria nao encontrada/i, "Pasta não encontrada."],
    [/Categoria pai esta inativa/i, "A pasta escolhida está oculta."],
    [/Permissao ja concedida/i, "Este professor já pode gerenciar essa pasta."],
    [/Permissao nao encontrada|Permissao ja revogada/i, "Esse acesso não está mais disponível."],
    [/Google|OAuth|scope|refresh token|access token|invalid_grant/i, "A conexão com o Google Drive precisa ser renovada."],
    [/SQL|database|banco indisponivel|ECONNREFUSED/i, "O sistema está temporariamente indisponível. Tente novamente em instantes."],
    [/Material nao encontrado/i, "Esse material não está mais disponível."],
    [/arquivo.*grande|limite.*arquivo/i, "Esse arquivo é maior que o limite permitido."],
    [/tipo.*permitido|MIME|extensao/i, "Use um arquivo PDF ou vídeo compatível."],
    [/Autenticacao necessaria|não autenticado|nao autenticado/i, "Sua sessão terminou. Entre novamente."],
    [/Movimentacao criaria ciclo/i, "Essa pasta não pode ficar dentro de uma de suas próprias subpastas."],
    [/Categoria nao pode ser pai de si mesma/i, "Uma pasta não pode ficar dentro dela mesma."]
  ];

  for (const traducao of traducoes) {
    if (traducao[0].test(mensagem)) return traducao[1];
  }

  if (/^[A-Z0-9_]+$/.test(mensagem) || /stack|query|repository|endpoint|payload/i.test(mensagem)) {
    return "Não foi possível concluir essa ação. Tente novamente.";
  }

  return mensagem;
}

function Modal({ titulo, descricao, aoFechar, children, classe }) {
  useEffect(function prepararModal() {
    function fecharComEscape(evento) {
      if (evento.key === "Escape") aoFechar();
    }
    const rolagemAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", fecharComEscape);
    return function restaurarPagina() {
      document.body.style.overflow = rolagemAnterior;
      document.removeEventListener("keydown", fecharComEscape);
    };
  }, [aoFechar]);

  return (
    <div className="fundo-modal" role="presentation" onMouseDown={function fecharFundo(evento) { if (evento.target === evento.currentTarget) aoFechar(); }}>
      <section className={"modal " + (classe || "")} role="dialog" aria-modal="true" aria-labelledby="titulo-modal">
        <header className="cabecalho-modal">
          <div><h2 id="titulo-modal">{titulo}</h2>{descricao && <p>{descricao}</p>}</div>
          <button type="button" className="botao-icone" aria-label="Fechar" onClick={aoFechar}><Icone nome="fechar" /></button>
        </header>
        <div className="conteudo-modal">{children}</div>
      </section>
    </div>
  );
}

function Carregando({ texto }) {
  return <div className="estado-interface carregando" role="status"><span className="indicador-carregamento" aria-hidden="true" /><strong>{texto || "Carregando..."}</strong></div>;
}

function Esqueleto({ linhas, texto }) {
  const quantidade = linhas || 4;
  return <div className="esqueleto-interface" role="status" aria-label={texto || "Carregando conteúdo"}><span>{texto || "Carregando conteúdo..."}</span>{Array.from({ length: quantidade }, function criar(_, indice) { return <i key={indice}><b /><b /></i>; })}</div>;
}

function Vazio({ titulo, texto, acao }) {
  return <div className="estado-interface"><span className="icone-estado" aria-hidden="true"><Icone nome="acervo" tamanho={26} /></span><strong>{titulo}</strong>{texto && <p>{texto}</p>}{acao}</div>;
}

function Alerta({ tipo, children }) {
  return <div className={"aviso " + tipo} role={tipo === "erro" ? "alert" : "status"}><Icone nome={tipo === "erro" ? "alerta" : "sucesso"} /><span>{children}</span></div>;
}

function lerTemaSalvo() {
  return window.localStorage.getItem("plantel-tema") === "claro" ? "claro" : "escuro";
}

function aplicarTema(tema) {
  const raiz = document.documentElement;
  raiz.classList.add("tema-sem-transicao");
  raiz.dataset.tema = tema;
  window.localStorage.setItem("plantel-tema", tema);
  window.requestAnimationFrame(function concluirTroca() {
    raiz.classList.remove("tema-sem-transicao");
  });
}

function AlternadorTema({ classe, compacto }) {
  const [tema, definirTema] = useState(lerTemaSalvo);

  useEffect(function sincronizarAlternadores() {
    function receberTema(evento) { definirTema(evento.detail); }
    window.addEventListener("plantel-tema-alterado", receberTema);
    return function removerEscuta() { window.removeEventListener("plantel-tema-alterado", receberTema); };
  }, []);

  function alternar() {
    const novoTema = tema === "escuro" ? "claro" : "escuro";
    aplicarTema(novoTema);
    definirTema(novoTema);
    window.dispatchEvent(new CustomEvent("plantel-tema-alterado", { detail: novoTema }));
  }

  return <button type="button" className={(compacto ? "botao-icone" : "alternar-tema") + (classe ? " " + classe : "")} onClick={alternar} aria-label={tema === "escuro" ? "Usar modo claro" : "Usar modo escuro"}><Icone nome={tema === "escuro" ? "sol" : "lua"} />{!compacto && <span>{tema === "escuro" ? "Claro" : "Escuro"}</span>}</button>;
}

export { Icone, mensagemHumana, Modal, Carregando, Esqueleto, Vazio, Alerta, AlternadorTema, aplicarTema, lerTemaSalvo };
