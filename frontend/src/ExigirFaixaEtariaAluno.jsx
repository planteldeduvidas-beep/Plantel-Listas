import React, { useEffect, useRef, useState } from 'react';
import { obterFaixaEtaria, atualizarFaixaEtaria } from './api.js';
import { CampoFaixaEtaria } from './FaixaEtariaAluno.jsx';
import { Alerta, mensagemHumana } from './ComponentesInterface.jsx';

export function PerguntaFaixaEtaria({ valor, aoAlterar, aoSalvar, salvando, erro }) {
  const formulario = useRef(null);
  useEffect(() => { formulario.current?.querySelector('select')?.focus(); }, []);
  function manterFoco(e) {
    if (e.key !== 'Tab') return;
    const controles = [...formulario.current.querySelectorAll('select:not(:disabled),button:not(:disabled)')];
    const primeiro = controles[0], ultimo = controles.at(-1);
    if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo?.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro?.focus(); }
  }
  return <div className="coleta-faixa-fundo"><section className="coleta-faixa-modal faixa-etaria-aluno" role="dialog" aria-modal="true" aria-labelledby="titulo-coleta-faixa" onKeyDown={manterFoco}>
    <h1 id="titulo-coleta-faixa">Antes de começar</h1>
    <p>Usamos essa informação para aplicar os cuidados adequados à sua faixa etária. Esta é uma declaração do usuário e não constitui comprovação de idade.</p>
    <form ref={formulario} onSubmit={aoSalvar}><CampoFaixaEtaria valor={valor} aoAlterar={aoAlterar} desabilitado={salvando} explicar={false} />
      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      <div className="acoes-faixa-etaria"><button className="botao-principal" type="submit" disabled={!valor || salvando}>{salvando ? 'Salvando…' : 'Continuar'}</button></div>
    </form><small>Depois, confira esta informação em Meu perfil. Sua conta e seu histórico serão mantidos.</small>
  </section></div>;
}

export default function ExigirFaixaEtariaAluno({ usuario, children, aoSair }) {
  const [dados, definirDados] = useState(null), [valor, definirValor] = useState(''), [erro, definirErro] = useState('');
  const [salvando, definirSalvando] = useState(false), [tentativa, definirTentativa] = useState(0);
  useEffect(() => {
    let ativo = true; definirDados(null); definirErro('');
    if (usuario.papel === 'aluno') obterFaixaEtaria().then(d => { if (ativo) definirDados(d); }).catch(e => { if (ativo) definirErro(mensagemHumana(e)); });
    return () => { ativo = false; };
  }, [usuario.id, usuario.papel, tentativa]);
  async function salvar(e) {
    e.preventDefault(); if (salvando || !valor) return;
    definirSalvando(true); definirErro('');
    try { definirDados(await atualizarFaixaEtaria(valor)); }
    catch (f) { definirErro(mensagemHumana(f)); }
    finally { definirSalvando(false); }
  }
  if (usuario.papel !== 'aluno') return children;
  if (!dados) return <main className="pagina-autenticacao"><section className="cartao-autenticacao"><h1>Preparando sua conta</h1>{erro ? <><Alerta tipo="erro">{erro}</Alerta><button onClick={() => definirTentativa(t => t + 1)}>Tentar novamente</button><button className="botao-secundario" onClick={aoSair}>Sair da conta</button></> : <p>Conferindo suas informações…</p>}</section></main>;
  if (dados.faixaEtaria) return children;
  return <PerguntaFaixaEtaria valor={valor} aoAlterar={definirValor} aoSalvar={salvar} salvando={salvando} erro={erro} />;
}
