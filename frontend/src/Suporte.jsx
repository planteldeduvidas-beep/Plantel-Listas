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
      <div className="cabecalho-bloco"><div><span className="icone-destaque"><Icone nome="suporte" tamanho={24} /></span><h2>Como podemos ajudar?</h2><p>Envie sua dúvida para a equipe do Plantel. A resposta chegará em <strong>{usuario.email}</strong>.</p></div></div>
      <form className="formulario-suporte" onSubmit={enviar}>
        <label>Assunto<input value={assunto} minLength="3" maxLength="120" onChange={function atualizar(evento) { definirAssunto(evento.target.value); }} required /></label>
        <label>Mensagem<textarea value={mensagem} minLength="10" maxLength="4000" rows="8" onChange={function atualizar(evento) { definirMensagem(evento.target.value); }} required /></label>
        <small>{mensagem.length.toLocaleString("pt-BR")} de 4.000 caracteres</small>
        {retorno && <Alerta tipo="sucesso">{retorno}</Alerta>}
        {erro && <Alerta tipo="erro">{erro}</Alerta>}
        <button type="submit" className="botao-principal" disabled={enviando}>{enviando ? "Enviando..." : "Enviar mensagem"}</button>
      </form>
    </section>
  );
}

export default Suporte;
