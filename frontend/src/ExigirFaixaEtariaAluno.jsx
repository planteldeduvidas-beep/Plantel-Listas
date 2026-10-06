import React, { useEffect, useRef, useState } from 'react';
import { obterFaixaEtaria, atualizarFaixaEtaria, obterTermosAluno, aceitarTermosAluno } from './api.js';
import { CaixaAceiteTermos, aceiteAtual, versoesCompativeis, adiarTermosAluno, TermosTratadosNaColeta } from './TermosAluno.jsx';
import { CampoFaixaEtaria } from './FaixaEtariaAluno.jsx';
import { Alerta, mensagemHumana } from './ComponentesInterface.jsx';

export function PerguntaFaixaEtaria({ valor, aoAlterar, aoSalvar, salvando, erro, children }) {
  const formulario = useRef(null);
  useEffect(() => { formulario.current?.querySelector('select')?.focus(); }, []);
  function manterFoco(e) {
    if (e.key !== 'Tab') return;
    const controles = [...formulario.current.querySelectorAll('select:not(:disabled),button:not(:disabled),input:not(:disabled),a[href]')];
    const primeiro = controles[0], ultimo = controles.at(-1);
    if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo?.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro?.focus(); }
  }
  return <div className="coleta-faixa-fundo"><section className="coleta-faixa-modal faixa-etaria-aluno" role="dialog" aria-modal="true" aria-labelledby="titulo-coleta-faixa" onKeyDown={manterFoco}>
    <h1 id="titulo-coleta-faixa">Antes de começar</h1>
    <p>Usamos essa informação para aplicar os cuidados adequados à sua faixa etária. Esta é uma declaração do usuário e não constitui comprovação de idade.</p>
    <form ref={formulario} onSubmit={aoSalvar}><CampoFaixaEtaria valor={valor} aoAlterar={aoAlterar} desabilitado={salvando} explicar={false} />
      {children}
      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      <div className="acoes-faixa-etaria"><button className="botao-principal" type="submit" disabled={!valor || salvando}>{salvando ? 'Salvando…' : 'Continuar'}</button></div>
    </form><small>Depois, confira esta informação em Meu perfil. Sua conta e seu histórico serão mantidos.</small>
  </section></div>;
}

export default function ExigirFaixaEtariaAluno({ usuario, children, aoSair }) {
  const [dados, definirDados] = useState(null), [valor, definirValor] = useState(''), [erro, definirErro] = useState('');
  const [salvando, definirSalvando] = useState(false), [tentativa, definirTentativa] = useState(0);
  const [termos, definirTermos] = useState(null), [termosMarcados, definirTermosMarcados] = useState(false);
  const [salvandoTermos, definirSalvandoTermos] = useState(false), [erroTermos, definirErroTermos] = useState('');
  const [termosTratados, definirTermosTratados] = useState(false);
  useEffect(() => {
    let ativo = true; definirDados(null); definirErro('');
    if (usuario.papel === 'aluno') Promise.all([obterFaixaEtaria(),obterTermosAluno().catch(()=>null)]).then(([d,t]) => {
      if (ativo) { definirDados(d); definirTermos(t); }
    }).catch(e => { if (ativo) definirErro(mensagemHumana(e)); });
    return () => { ativo = false; };
  }, [usuario.id, usuario.papel, tentativa]);
  async function salvar(e) {
    e.preventDefault(); if (salvando || salvandoTermos || !valor) return;
    definirSalvando(true); definirErro('');
    try {
      const atualizada = await atualizarFaixaEtaria(valor);
      // Não exibir um segundo popup logo após o aluno optar por aceitar depois.
      if (termos?.pendente && !termosMarcados) adiarTermosAluno(usuario.id);
      definirTermosTratados(Boolean(termos?.aplicavel));
      definirDados(atualizada);
    }
    catch (f) { definirErro(mensagemHumana(f)); }
    finally { definirSalvando(false); }
  }
  async function salvarAceite(marcado) {
    if (!marcado || salvandoTermos || !versoesCompativeis(termos?.versoes)) return;
    definirTermosMarcados(true); definirSalvandoTermos(true); definirErroTermos('');
    try { await aceitarTermosAluno(aceiteAtual(true)); }
    catch (falha) {
      definirTermosMarcados(false);
      definirErroTermos(mensagemHumana(falha));
      if (falha.codigo === 'VERSAO_TERMOS_DESATUALIZADA') definirTermos(t => ({...t,versoes:null}));
    }
    finally { definirSalvandoTermos(false); }
  }
  if (usuario.papel !== 'aluno') return children;
  if (!dados) return <main className="pagina-autenticacao"><section className="cartao-autenticacao"><h1>Preparando sua conta</h1>{erro ? <><Alerta tipo="erro">{erro}</Alerta><button onClick={() => definirTentativa(t => t + 1)}>Tentar novamente</button><button className="botao-secundario" onClick={aoSair}>Sair da conta</button></> : <p>Conferindo suas informações…</p>}</section></main>;
  if (dados.faixaEtaria) return <TermosTratadosNaColeta.Provider value={termosTratados}>{children}</TermosTratadosNaColeta.Provider>;
  return <PerguntaFaixaEtaria valor={valor} aoAlterar={definirValor} aoSalvar={salvar} salvando={salvando||salvandoTermos} erro={erro}>
    {termos?.pendente && <section className="termos-na-coleta" aria-label="Termos de Uso e Privacidade">
      <h2>Termos de Uso e Privacidade</h2>
      <p>Marque a caixa para salvar seu aceite automaticamente. Os links estão disponíveis para consulta. Se preferir, você pode aceitar depois e continuar estudando.</p>
      <CaixaAceiteTermos marcado={termosMarcados} aoAlterar={salvarAceite} desabilitado={salvando||salvandoTermos||termosMarcados||!versoesCompativeis(termos.versoes)} obrigatorio={false} />
      {salvandoTermos && <p role="status">Salvando seu aceite…</p>}
      {termosMarcados && !salvandoTermos && <p role="status">Aceite salvo.</p>}
      {erroTermos && <Alerta tipo="erro">{erroTermos}</Alerta>}
      {!versoesCompativeis(termos.versoes) && <><p>Atualize a página para consultar e aceitar a versão atual dos termos.</p><button type="button" onClick={()=>window.location.reload()}>Atualizar página</button></>}
    </section>}
  </PerguntaFaixaEtaria>;
}
