import React, { useState } from "react";
import { enviarAjudaConta } from "./api.js";
import { Alerta, mensagemHumana } from "./ComponentesInterface.jsx";
import AvisoEmail from "./AvisoEmail.jsx";

export default function AjudaConta({ aoVoltar }) {
  const [dados, definirDados] = useState({ nome: "", emailConta: "", emailResposta: "", mensagem: "" });
  const [enviando, definirEnviando] = useState(false);
  const [enviado, definirEnviado] = useState(false);
  const [erro, definirErro] = useState("");
  function alterar(evento) { definirDados(atual => ({ ...atual, [evento.target.name]: evento.target.value })); }
  async function enviar(evento) {
    evento.preventDefault();
    if (enviando || enviado) return;
    definirEnviando(true); definirErro("");
    try { await enviarAjudaConta(dados); definirEnviado(true); }
    catch (falha) { definirErro(mensagemHumana(falha)); }
    finally { definirEnviando(false); }
  }
  return <>
    <h1 id="titulo-ajuda-conta">Problemas com sua conta?</h1>
    <p>Conte o que aconteceu. Nossa equipe responderá em até 24 horas pelo e-mail de contato informado.</p>
    <p>Não envie sua senha, códigos de confirmação ou links de acesso. Esta mensagem não altera nem libera sua conta automaticamente.</p>
    <AvisoEmail />
    {enviado ? <Alerta tipo="sucesso">Mensagem enviada. Responderemos em até 24 horas. Confira também Spam ou Lixo eletrônico.</Alerta> :
      <form onSubmit={enviar}>
        <label>Nome completo<input name="nome" autoComplete="name" required minLength={2} maxLength={120} value={dados.nome} onChange={alterar} /></label>
        <label>E-mail ou identificação usada na conta<input name="emailConta" required minLength={2} maxLength={254} value={dados.emailConta} onChange={alterar} /><small>Informe como você se identifica no Plantel, mesmo se o e-mail cadastrado estiver errado.</small></label>
        <label>E-mail para receber a resposta<input name="emailResposta" type="email" autoComplete="email" required maxLength={254} value={dados.emailResposta} onChange={alterar} /><small>Use um endereço ao qual você tenha acesso. Pode ser diferente do e-mail da conta.</small></label>
        <label>Qual é o problema?<textarea name="mensagem" required minLength={10} maxLength={3500} rows={4} value={dados.mensagem} onChange={alterar} /></label>
        {erro && <Alerta tipo="erro">{erro}</Alerta>}
        <button className="botao-principal botao-largo" disabled={enviando}>{enviando ? "Enviando..." : "Enviar ao suporte"}</button>
      </form>}
    <nav className="acoes-secundarias"><button type="button" disabled={enviando} onClick={aoVoltar}>Voltar para entrar</button></nav>
  </>;
}
