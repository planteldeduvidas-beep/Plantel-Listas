import React, { useState } from "react";
import { enviarSuporte } from "./api.js";
import { Alerta, Icone, mensagemHumana } from "./ComponentesInterface.jsx";

function Suporte({ usuario }) {
  const [assunto, definirAssunto] = useState("");
  const [mensagem, definirMensagem] = useState("");
  const [retorno, definirRetorno] = useState("");
  const [erro, definirErro] = useState("");
  const [enviando, definirEnviando] = useState(false);

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
      <aside className="apresentacao-suporte">
        <span className="icone-destaque"><Icone nome="suporte" tamanho={24} /></span>
        <span className="sobrelinha-suporte">Atendimento Plantel</span>
        <h2>Como podemos ajudar?</h2>
        <p>Conte o que aconteceu com o máximo de detalhes. Nossa equipe responderá no e-mail da sua conta.</p>
        <dl className="detalhes-suporte">
          <div><dt>Resposta em</dt><dd>{usuario.email}</dd></div>
          <div><dt>Canal</dt><dd>Atendimento por e-mail</dd></div>
        </dl>
        <small className="aviso-seguranca-suporte">Nunca envie senhas ou códigos de acesso na mensagem.</small>
      </aside>
      <form className="formulario-suporte" onSubmit={enviar}>
        <div className="cabecalho-formulario-suporte"><span>Nova mensagem</span><small>Todos os campos são obrigatórios</small></div>
        <label>Assunto<input placeholder="Resuma o que você precisa" value={assunto} minLength="3" maxLength="120" onChange={function atualizar(evento) { definirAssunto(evento.target.value); }} required /></label>
        <label>Mensagem<textarea placeholder="Explique sua dúvida ou dificuldade" value={mensagem} minLength="10" maxLength="4000" rows="8" onChange={function atualizar(evento) { definirMensagem(evento.target.value); }} required /></label>
        <small>{mensagem.length.toLocaleString("pt-BR")} de 4.000 caracteres</small>
        {retorno && <Alerta tipo="sucesso">{retorno}</Alerta>}
        {erro && <Alerta tipo="erro">{erro}</Alerta>}
        <button type="submit" className="botao-principal" disabled={enviando}>{enviando ? "Enviando..." : "Enviar mensagem"}</button>
      </form>
    </section>
  );
}

export default Suporte;
