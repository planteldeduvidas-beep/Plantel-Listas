import React, { useState } from "react";
import { reenviarConfirmacaoCadastro, confirmarCadastroEmail } from "./api.js";
import { Alerta, CampoSenha, mensagemHumana } from "./ComponentesInterface.jsx";
import AvisoEmail from "./AvisoEmail.jsx";
import "./gestaoUsuarios.css";

export function AguardarConfirmacaoCadastro({ emailAtual, mensagemInicial, aoVoltar }) {
  const [email, setEmail] = useState(emailAtual);
  const [senha, setSenha] = useState("");
  const [mensagem, setMensagem] = useState(mensagemInicial);
  const [tipoMensagem, setTipoMensagem] = useState("info");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  async function reenviar(e) {
    e.preventDefault(); setOcupado(true); setErro(""); setMensagem("");
    try { setMensagem((await reenviarConfirmacaoCadastro(emailAtual, email, senha)).mensagem); setTipoMensagem("sucesso"); }
    catch (falha) { setErro(mensagemHumana(falha)); }
    finally { setOcupado(false); setSenha(""); }
  }
  return <main className="pagina-autenticacao confirmacao-centralizada"><section className="cartao-autenticacao">
    <h1>Confirme seu e-mail para entrar</h1>
    <p>Seu cadastro está pendente em <strong>{emailAtual}</strong>. Abra o link recebido e toque em “Confirmar e-mail”. Sua conta só será criada depois disso.</p>
    <p className="aviso-confirmacao-curto">Confira a caixa de entrada e também <strong>Spam ou Lixo eletrônico</strong> e Promoções. Isso vale para qualquer provedor.</p>
    {mensagem && <Alerta tipo={tipoMensagem}>{mensagem}</Alerta>}
    {erro && <Alerta tipo="erro">{erro}</Alerta>}
    <details className="opcoes-confirmacao"><summary>Não recebeu? Reenviar ou corrigir o e-mail</summary><form onSubmit={reenviar}>
      <p>Não recebeu ou digitou errado? Confira o endereço abaixo e informe a senha que escolheu no cadastro. Seu e-mail só muda quando você confirmar o novo link.</p>
      <label>E-mail para receber o link<input type="email" autoComplete="email" maxLength={254} value={email} onChange={e => setEmail(e.target.value)} required disabled={ocupado} /></label>
      <label>Senha do cadastro<CampoSenha autoComplete="current-password" minLength={12} maxLength={128} value={senha} onChange={e => setSenha(e.target.value)} required disabled={ocupado} /></label>
      <button type="submit" disabled={ocupado}>{ocupado ? "Enviando..." : "Reenviar link de confirmação"}</button>
    </form><AvisoEmail /></details>
    <p>Esqueceu a senha escolhida? Confirme primeiro pelo link recebido e depois use “Esqueci minha senha” na entrada.</p>
    <button type="button" className="botao-secundario" disabled={ocupado} onClick={aoVoltar}>Voltar para entrar</button>
  </section></main>;
}

export function ConfirmacaoCadastro({ token, aoVoltar }) {
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  async function confirmar() {
    setOcupado(true); setErro("");
    try { setResultado(await confirmarCadastroEmail(token)); }
    catch (falha) { setErro(mensagemHumana(falha)); }
    finally { setOcupado(false); }
  }
  return <main className="pagina-autenticacao confirmacao-centralizada"><section className="cartao-autenticacao">
    <h1>Confirme seu cadastro</h1>
    {resultado ? <><Alerta tipo="sucesso">{resultado.mensagem}</Alerta><p>E-mail: <strong>{resultado.email}</strong></p></> : <>
      <p>Toque abaixo para confirmar que você tem acesso a este e-mail e liberar seu novo cadastro.</p>
      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      <button type="button" disabled={ocupado} onClick={confirmar}>{ocupado ? "Confirmando..." : "Confirmar e-mail"}</button>
    </>}
    <button type="button" className="botao-secundario" disabled={ocupado} onClick={() => aoVoltar(resultado?.email)}>Voltar ao Plantel</button>
    {erro && <p>Para reenviar um link, volte à tela de entrada e informe o e-mail cadastrado e a senha. Nenhuma conta existente será bloqueada por este link.</p>}
    <AvisoEmail />
  </section></main>;
}
