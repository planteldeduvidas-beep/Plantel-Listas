import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icone } from "./ComponentesInterface.jsx";
import "./gestaoUsuarios.css";

// Fora da lista: overflow e stacking contexts dos cards não recortam o menu.
export default function MenuUsuario({ item, proprio, aoAcao }) {
  const [aberto, setAberto] = useState(false);
  const [posicao, setPosicao] = useState({ top: 0, left: 0 });
  const gatilho = useRef(null), menu = useRef(null);
  useLayoutEffect(() => {
    if (!aberto) return;
    const r = gatilho.current.getBoundingClientRect(), m = menu.current.getBoundingClientRect();
    setPosicao({ left: Math.max(8, Math.min(r.right - m.width, window.innerWidth - m.width - 8)),
      top: Math.max(8, r.bottom + m.height + 8 <= window.innerHeight ? r.bottom + 6 : r.top - m.height - 6) });
    menu.current.querySelector("button")?.focus();
  }, [aberto]);
  useEffect(() => {
    if (!aberto) return;
    function fechar(e) {
      if (e.type === "keydown" && e.key !== "Escape") return;
      if (e.type === "pointerdown" && (menu.current?.contains(e.target) || gatilho.current?.contains(e.target))) return;
      if (e.type === "scroll" && menu.current?.contains(e.target)) return;
      setAberto(false);
      if (e.type === "keydown") gatilho.current?.focus();
    }
    document.addEventListener("pointerdown", fechar);
    document.addEventListener("keydown", fechar);
    window.addEventListener("scroll", fechar, true);
    window.addEventListener("resize", fechar);
    return () => {
      document.removeEventListener("pointerdown", fechar); document.removeEventListener("keydown", fechar);
      window.removeEventListener("scroll", fechar, true); window.removeEventListener("resize", fechar);
    };
  }, [aberto]);
  const acoes = [["detalhes", "Detalhes"], ["dados", "Editar dados"], ["senha", "Enviar redefinição de senha"],
    ["verificar", "Enviar verificação de e-mail"], ["regularizar", "Solicitar revisão do e-mail"],
    ["estado", item.ativo ? "Bloquear conta" : "Desbloquear conta"], ["excluir", "Excluir conta"]];
  if (item.papel === 'aluno') acoes.splice(2,0,['faixa','Revisar faixa etária']);
  return <><button type="button" ref={gatilho} className="gatilho-menu-usuario" aria-label={"Mais opções para " + item.nome}
    aria-expanded={aberto} aria-controls={aberto ? "menu-usuario-" + item.id : undefined} onClick={() => setAberto(!aberto)}><Icone nome="opcoes" /><span>Opções</span></button>
    {aberto && createPortal(<div ref={menu} id={"menu-usuario-" + item.id} className="menu-usuario-flutuante" style={posicao} aria-label={"Ações para " + item.nome}>
      {acoes.filter(([tipo]) => !item.emailConfirmado || !["verificar", "regularizar"].includes(tipo)).map(([tipo, texto]) => <button key={tipo} type="button" disabled={proprio && ["estado", "excluir"].includes(tipo)}
        className={tipo === "excluir" ? "perigo-texto" : ""} onClick={() => { setAberto(false); aoAcao(tipo, item); }}>{texto}</button>)}
    </div>, document.body)}</>;
}
