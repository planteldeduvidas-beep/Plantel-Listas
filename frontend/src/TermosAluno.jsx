import React, {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import versoes from '../../shared/documentosLegais.json';
import {obterTermosAluno,aceitarTermosAluno} from './api.js';
import {Modal,Alerta,mensagemHumana} from './ComponentesInterface.jsx';
import './termosAluno.css';

export const aceiteAtual = aceito => ({aceito, ...versoes});
export function CaixaAceiteTermos({marcado,aoAlterar}) {
  return <label className="aceite-termos"><input type="checkbox" checked={marcado} onChange={e=>aoAlterar(e.target.checked)} required />
    <span>Aceito os <a href="/termos" target="_blank" rel="noopener noreferrer">Termos de Uso</a> e estou ciente da <a href="/privacidade" target="_blank" rel="noopener noreferrer">Política de Privacidade</a>.</span>
  </label>;
}
export function AvisoTermosAluno({usuario,aoLiberar}) {
  const dialogo=useRef(null);
  const [aberto,definirAberto]=useState(false), [marcado,definirMarcado]=useState(false);
  const [salvando,definirSalvando]=useState(false), [erro,definirErro]=useState('');
  const chave=`plantel-termos-adiados:${usuario.id}:${versoes.termos}:${versoes.privacidade}`;
  useEffect(()=>{
    if(!aberto) return;
    const anterior=document.activeElement;
    dialogo.current?.querySelector('button')?.focus();
    function manterFoco(e) {
      if(e.key!=='Tab') return;
      const itens=Array.from(dialogo.current?.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled)')||[]);
      const primeiro=itens[0],ultimo=itens.at(-1);
      if(e.shiftKey && document.activeElement===primeiro) { e.preventDefault(); ultimo?.focus(); }
      else if(!e.shiftKey && document.activeElement===ultimo) { e.preventDefault(); primeiro?.focus(); }
    }
    document.addEventListener('keydown',manterFoco);
    return ()=>{document.removeEventListener('keydown',manterFoco);if(anterior?.isConnected) anterior.focus();};
  },[aberto]);
  useEffect(()=>{
    let ativo=true;
    if(usuario.papel!=='aluno') { aoLiberar(); return; }
    let adiado=false;
    try { adiado=Number(localStorage.getItem(chave))>Date.now(); } catch {}
    if(adiado) { aoLiberar(); return; }
    obterTermosAluno().then(dados=>{
      if(!ativo) return;
      if(dados.aplicavel && dados.pendente) definirAberto(true); else aoLiberar();
    }).catch(()=>{if(ativo) aoLiberar();}); // A consulta do aviso nao interrompe o acesso existente.
    return ()=>{ativo=false;};
  },[usuario.id,usuario.papel,chave,aoLiberar]);
  function adiar() {
    if(salvando) return;
    try { localStorage.setItem(chave,String(Date.now()+86400000)); } catch {}
    definirAberto(false); aoLiberar();
  }
  async function aceitar(e) {
    e.preventDefault(); if(!marcado || salvando) return;
    definirSalvando(true); definirErro('');
    try { await aceitarTermosAluno(aceiteAtual(true)); definirAberto(false); aoLiberar(); }
    catch(falha) { definirErro(mensagemHumana(falha)); }
    finally { definirSalvando(false); }
  }
  if(usuario.papel!=='aluno' || !aberto) return null;
  return createPortal(<div ref={dialogo}><Modal titulo="Termos de Uso e Privacidade" descricao="Reserve um momento para conhecer os documentos do Plantel Listas." aoFechar={adiar} classe="modal-termos-aluno">
    <p>Leia os documentos nos links abaixo e marque a caixa para registrar seu aceite. Você também pode deixar para depois e continuar estudando.</p>
    <form onSubmit={aceitar}>
      <CaixaAceiteTermos marcado={marcado} aoAlterar={definirMarcado} />
      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      <div className="acoes-termos"><button type="button" onClick={adiar} disabled={salvando}>Agora não</button><button type="submit" className="botao-principal" disabled={!marcado||salvando}>{salvando?'Salvando…':'Aceitar e continuar'}</button></div>
    </form>
  </Modal></div>,document.body);
}
