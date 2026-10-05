import React, { useEffect, useState } from "react";
import { solicitarConfirmacaoEmail, confirmarEmail } from "./api.js";
import { Alerta, CampoSenha, mensagemHumana } from "./ComponentesInterface.jsx";
import AvisoEmail from "./AvisoEmail.jsx";

export function LembreteEmailConta({ usuario, aoAtualizar }) {
  if (!usuario.emailPrecisaRevisao) return null;
  return <aside className="lembrete-email-conta" aria-label="Confira seu e-mail">
    <div><strong>Confira seu e-mail</strong><p>Confirme um e-mail ao qual você tenha acesso para receber respostas do suporte e recuperar sua senha. Seu acesso ao Plantel continua disponível.</p></div>
    <button type="button" className="botao-secundario" onClick={aoAtualizar}>Atualizar ou confirmar e-mail</button>
  </aside>;
}

export function FormularioEmailConta({ usuario }) {
  const [email, definirEmail] = useState(usuario.email);
  const [senha, definirSenha] = useState("");
  const [ocupado, definirOcupado] = useState(false);
  const [mensagem, definirMensagem] = useState("");
  const [erro, definirErro] = useState("");
  useEffect(() => { definirEmail(usuario.email); definirSenha(""); definirMensagem(""); definirErro(""); }, [usuario.id, usuario.email]);

  async function enviar(evento) {
    evento.preventDefault();
    definirOcupado(true); definirErro(""); definirMensagem("");
    try {
      const resultado = await solicitarConfirmacaoEmail(email, senha);
      definirMensagem(resultado.mensagem);
    } catch (falha) { definirErro(mensagemHumana(falha)); }
    finally { definirSenha(""); definirOcupado(false); }
  }
  return <form className="formulario-email-conta" onSubmit={enviar}>
    <p>Seu e-mail atual é <strong>{usuario.email}</strong>. Informe um endereço ao qual você tenha acesso. Aceitamos Gmail, Outlook, Hotmail e outros provedores, inclusive e-mails escolares.</p>
    <p>Para confirmar o endereço atual, mantenha-o no campo abaixo. Para trocar, digite o novo. Enviaremos um link: abra-o na mesma conta do Plantel e confirme. Até lá, continue entrando e recuperando a senha com o e-mail atual.</p>
    <label>E-mail para confirmar<input type="email" autoComplete="email" value={email} onChange={e => definirEmail(e.target.value)} maxLength={254} disabled={ocupado} required /></label>
    <label>Sua senha atual<CampoSenha autoComplete="current-password" minLength={12} maxLength={128} value={senha} onChange={e => definirSenha(e.target.value)} disabled={ocupado} required /></label>
    <p>Esqueceu a senha? Saia da conta e use “Esqueci a senha” com seu e-mail atual. Se também perdeu o acesso a esse e-mail, peça ajuda à equipe pelo Suporte. Nunca envie sua senha.</p>
    <AvisoEmail />
    {mensagem && <Alerta tipo="sucesso">{mensagem}</Alerta>}
    {erro && <Alerta tipo="erro">{erro}</Alerta>}
    <button type="submit" className="botao-principal" disabled={ocupado}>{ocupado ? "Enviando..." : "Enviar link de confirmação"}</button>
    {mensagem && <small>Não chegou? Confira o endereço e as pastas de e-mail. Você pode enviar novamente; apenas o link mais recente será válido.</small>}
  </form>;
}

export function ConfirmacaoEmail({ usuario, token, aoConcluir, aoCancelar }) {
  const [ocupado, definirOcupado] = useState(false);
  const [erro, definirErro] = useState("");
  const [resultado, definirResultado] = useState(null);
  async function confirmar() {
    definirOcupado(true); definirErro("");
    try { definirResultado(await confirmarEmail(token)); }
    catch (falha) { definirErro(mensagemHumana(falha)); }
    finally { definirOcupado(false); }
  }
  return <main className="pagina-autenticacao"><section className="cartao-autenticacao">
    <h1>Confirme seu e-mail</h1>
    {resultado ? <><Alerta tipo="sucesso">{resultado.mensagem}</Alerta><p>Seu e-mail: <strong>{resultado.usuario.email}</strong></p><button type="button" onClick={() => aoConcluir(resultado)}>Voltar ao Plantel</button></> : <>
    <p>Você está na conta <strong>{usuario.email}</strong>. Se pediu a confirmação ou troca deste endereço, toque abaixo para concluir. A troca mantém seus materiais, histórico e permissões na mesma conta.</p>
    <p>Se este pedido é de outra conta, toque em Agora não e entre com a conta que fez a solicitação. Depois abra novamente o link recebido.</p>
    {erro && <Alerta tipo="erro">{erro}</Alerta>}
    <div className="acoes-formulario"><button type="button" disabled={ocupado} onClick={confirmar}>{ocupado ? "Confirmando..." : "Confirmar e-mail"}</button><button type="button" className="botao-secundario" disabled={ocupado} onClick={aoCancelar}>Agora não</button></div>
    </>}
    <AvisoEmail />
  </section></main>;
}
