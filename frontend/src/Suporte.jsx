import React, { useRef, useState } from "react";
import { obterDuvidasSuporte } from "./duvidasSuporte.js";
import { enviarSuporte } from "./api.js";
import { Alerta, Icone, Modal, mensagemHumana } from "./ComponentesInterface.jsx";

function Suporte({ usuario }) {
  const campoAssunto = useRef(null);
  const chaveApresentacao = `plantel:suporte:apresentacao:${usuario.id}`;
  const [mostrarApresentacao, definirMostrarApresentacao] = useState(() => {
    try { return sessionStorage.getItem(chaveApresentacao) !== "vista"; }
    catch { return true; }
  });
  const [assunto, definirAssunto] = useState("");
  const [mensagem, definirMensagem] = useState("");
  const [retorno, definirRetorno] = useState("");
  const [erro, definirErro] = useState("");
  const [enviando, definirEnviando] = useState(false);

  function fecharApresentacao() {
    definirMostrarApresentacao(false);
    try { sessionStorage.setItem(chaveApresentacao, "vista"); }
    catch { /* O aviso não impede o suporte se o armazenamento estiver indisponível. */ }
  }

  async function enviar(evento) {
    evento.preventDefault();
    definirEnviando(true);
    definirRetorno("");
    definirErro("");
    try {
      const resultado = await enviarSuporte(assunto, mensagem);
      definirRetorno(resultado.mensagem);
      definirAssunto("");
      definirMensagem("");
    } catch (falha) {
      definirErro(mensagemHumana(falha));
    } finally {
      definirEnviando(false);
    }
  }

  return (
    <section className="bloco-admin painel-conteudo painel-suporte">
      <section className="duvidas-suporte" aria-labelledby="titulo-duvidas-suporte">
        <h2 id="titulo-duvidas-suporte">Dúvidas frequentes</h2>
        <p>Toque em uma pergunta para ver a resposta. Para um passo a passo, consulte também Como usar no menu.</p>
        {obterDuvidasSuporte(usuario.papel).map(({ pergunta, resposta }) => (
          <details key={pergunta}>
            <summary>{pergunta}</summary>
            <p>{resposta}</p>
          </details>
        ))}
        <div className="duvidas-suporte-contato">
          <span>Não encontrou sua resposta?</span>
          <button type="button" className="botao-secundario" onClick={() => campoAssunto.current?.focus()}>Envie uma mensagem</button>
        </div>
      </section>
      <aside className="apresentacao-suporte">
        <span className="icone-destaque"><Icone nome="suporte" tamanho={24} /></span>
        <span className="sobrelinha-suporte">Atendimento Plantel</span>
        <h2>Queremos ouvir você</h2>
        <p>Este espaço não é só para problemas ou bugs. Envie também dúvidas, feedback, opiniões e sugestões para melhorar o Plantel.</p>
        <p>Conte sua experiência ou explique sua ideia. Nossa equipe responderá no e-mail da sua conta.</p>
        <button type="button" className="botao-secundario" onClick={() => definirMostrarApresentacao(true)}>O que posso enviar?</button>
        <dl className="detalhes-suporte">
          <div><dt>Resposta em</dt><dd>{usuario.email}</dd></div>
          <div><dt>Canal</dt><dd>Atendimento por e-mail</dd></div>
        </dl>
        <small className="aviso-seguranca-suporte">Nunca envie senhas ou códigos de acesso na mensagem.</small>
      </aside>
      <form className="formulario-suporte" onSubmit={enviar}>
        <div className="cabecalho-formulario-suporte"><span>Nova mensagem</span><small>Todos os campos são obrigatórios</small></div>
        <label>Assunto<input ref={campoAssunto} placeholder="Ex.: sugestão de melhoria, dúvida ou problema" value={assunto} minLength="3" maxLength="120" onChange={function atualizar(evento) { definirAssunto(evento.target.value); }} required /></label>
        <label>Mensagem<textarea placeholder="Conte sua experiência, compartilhe uma ideia ou descreva o que aconteceu." value={mensagem} minLength="10" maxLength="4000" rows="8" onChange={function atualizar(evento) { definirMensagem(evento.target.value); }} required /></label>
        <small>{mensagem.length.toLocaleString("pt-BR")} de 4.000 caracteres</small>
        {retorno && <Alerta tipo="sucesso">{retorno}</Alerta>}
        {erro && <Alerta tipo="erro">{erro}</Alerta>}
        <button type="submit" className="botao-principal" disabled={enviando}>{enviando ? "Enviando..." : "Enviar mensagem"}</button>
      </form>
      {mostrarApresentacao && <Modal titulo="Sua opinião também tem espaço aqui" aoFechar={fecharApresentacao}>
        <p>Você não precisa encontrar um erro para falar com a gente. O Suporte é um canal para ouvir você e melhorar o Plantel juntos.</p>
        <ul>
          <li><strong>Dúvidas e problemas:</strong> peça ajuda ou avise sobre algo que não está funcionando.</li>
          <li><strong>Sugestões de melhoria:</strong> conte o que poderia facilitar seu dia a dia.</li>
          <li><strong>Feedback e opiniões:</strong> diga o que gostou e o que pode melhorar.</li>
        </ul>
        <p>Nunca envie senhas ou códigos de acesso.</p>
        <button type="button" className="botao-principal" onClick={fecharApresentacao} autoFocus>Entendi, quero enviar uma mensagem</button>
      </Modal>}
    </section>
  );
}

export default Suporte;
