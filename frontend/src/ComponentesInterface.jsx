import React, { useEffect } from "react";

function Icone({ nome, tamanho }) {
  const dimensao = tamanho || 20;
  const propriedades = {
    width: dimensao,
    height: dimensao,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true"
  };

  if (nome === "menu") return <svg {...propriedades}><path d="M4 7h16M4 12h16M4 17h16" /></svg>;
  if (nome === "fechar") return <svg {...propriedades}><path d="m6 6 12 12M18 6 6 18" /></svg>;
  if (nome === "acervo") return <svg {...propriedades}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z" /><path d="M4 5.5v16M8 7h8" /></svg>;
  if (nome === "pasta") return <svg {...propriedades}><path d="M3 6.5h7l2 2h9v9.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>;
  if (nome === "usuarios") return <svg {...propriedades}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
  if (nome === "acessos") return <svg {...propriedades}><circle cx="8" cy="15" r="4" /><path d="M11 12 21 2M17 6l3 3M14 9l3 3" /></svg>;
  if (nome === "organizacao") return <svg {...propriedades}><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></svg>;
  if (nome === "estatisticas") return <svg {...propriedades}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>;
  if (nome === "historico") return <svg {...propriedades}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
  if (nome === "drive") return <svg {...propriedades}><path d="m8.2 4 3.4 6H6.8L3.4 16 0 10z" transform="translate(4)" /><path d="m11.6 10 3.4 6H8.2l3.4-6" /><path d="M8.2 16h6.8l-3.4 6H4.8z" /></svg>;
  if (nome === "sair") return <svg {...propriedades}><path d="M10 17l5-5-5-5M15 12H3M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /></svg>;
  if (nome === "buscar") return <svg {...propriedades}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>;
  if (nome === "pdf") return <svg {...propriedades}><path d="M6 2h8l4 4v16H6z" /><path d="M14 2v5h5M8.5 16h7M8.5 12h5" /></svg>;
  if (nome === "video") return <svg {...propriedades}><rect x="3" y="5" width="14" height="14" rx="2" /><path d="m17 10 4-2v8l-4-2z" /></svg>;
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

  if (!mensagem || /failed to fetch|networkerror|fetch failed/i.test(mensagem)) {
    return "Não foi possível falar com o sistema. Verifique sua conexão e tente novamente.";
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
    [/sessao|não autenticado|nao autenticado/i, "Sua sessão terminou. Entre novamente."],
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

function Vazio({ titulo, texto, acao }) {
  return <div className="estado-interface"><span className="icone-estado" aria-hidden="true"><Icone nome="acervo" tamanho={26} /></span><strong>{titulo}</strong>{texto && <p>{texto}</p>}{acao}</div>;
}

function Alerta({ tipo, children }) {
  return <div className={"aviso " + tipo} role={tipo === "erro" ? "alert" : "status"}><Icone nome={tipo === "erro" ? "alerta" : "sucesso"} /><span>{children}</span></div>;
}

export { Icone, mensagemHumana, Modal, Carregando, Vazio, Alerta };
