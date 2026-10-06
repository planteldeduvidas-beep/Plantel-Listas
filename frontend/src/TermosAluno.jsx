import React, {createContext,useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import versoes from '../../shared/documentosLegais.json';
import {obterTermosAluno,aceitarTermosAluno} from './api.js';
import {Modal,Alerta,mensagemHumana} from './ComponentesInterface.jsx';
import './termosAluno.css';

export const aceiteAtual = aceito => ({aceito, ...versoes});
export const TermosTratadosNaColeta = createContext(false);
export function versoesCompativeis(recebidas) {
  return recebidas?.termos === versoes.termos && recebidas?.privacidade === versoes.privacidade;
}
export function CaixaAceiteTermos({marcado,aoAlterar,desabilitado=false,obrigatorio=true}) {
  return <label className="aceite-termos"><input type="checkbox" checked={marcado} disabled={desabilitado} onChange={e=>aoAlterar(e.target.checked)} required={obrigatorio} />
    <span>Aceito os <a href="/termos" target="_blank" rel="noopener noreferrer">Termos de Uso</a> e estou ciente da <a href="/privacidade" target="_blank" rel="noopener noreferrer">Política de Privacidade</a>.</span>
  </label>;
}
export function adiarTermosAluno(usuarioId) {
  const chave=`plantel-termos-adiados:${usuarioId}:${versoes.termos}:${versoes.privacidade}`;
  try { localStorage.setItem(chave,String(Date.now()+86400000)); } catch {}
}
export function AvisoTermosAluno({usuario,aoLiberar}) {
  const dialogo=useRef(null);
  const [aberto,definirAberto]=useState(false), [marcado,definirMarcado]=useState(false);
  const [salvando,definirSalvando]=useState(false), [erro,definirErro]=useState('');
  const [desatualizado,definirDesatualizado]=useState(false);
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
      if(dados.aplicavel && dados.pendente) {
        definirDesatualizado(!versoesCompativeis(dados.versoes));
        definirAberto(true);
      } else aoLiberar();
    }).catch(()=>{if(ativo) aoLiberar();}); // A consulta do aviso nao interrompe o acesso existente.
    return ()=>{ativo=false;};
  },[usuario.id,usuario.papel,chave,aoLiberar]);
  function adiar() {
    if(salvando) return;
    adiarTermosAluno(usuario.id);
    definirAberto(false); aoLiberar();
  }
  async function aceitar(valor) {
    if(!valor || salvando || desatualizado) return;
    definirMarcado(true);
    definirSalvando(true); definirErro('');
    try { await aceitarTermosAluno(aceiteAtual(true)); definirAberto(false); aoLiberar(); }
    catch(falha) {
      definirMarcado(false);
      if(falha.codigo === 'VERSAO_TERMOS_DESATUALIZADA') definirDesatualizado(true);
      else definirErro(mensagemHumana(falha));
    }
    finally { definirSalvando(false); }
  }
  if(usuario.papel!=='aluno' || !aberto) return null;
  return createPortal(<div ref={dialogo}><Modal titulo="Termos de Uso e Privacidade" descricao="Reserve um momento para conhecer os documentos do Plantel Listas." aoFechar={adiar} classe="modal-termos-aluno">
    <p>Os documentos estão disponíveis nos links abaixo. Ao marcar a caixa, seu aceite será salvo automaticamente. Você também pode deixar para depois e continuar estudando.</p>
    <div>
      {desatualizado && <Alerta tipo="aviso">Esta tela ficou aberta durante uma atualização. Atualize a página para ver a versão atual dos termos e preencher sua faixa etária, se ainda estiver pendente.</Alerta>}
      <CaixaAceiteTermos marcado={marcado} aoAlterar={aceitar} desabilitado={salvando||desatualizado} />
      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      {salvando && <p role="status">Salvando seu aceite…</p>}
      <div className="acoes-termos"><button type="button" onClick={adiar} disabled={salvando}>Agora não</button>{desatualizado && <button type="button" className="botao-principal" onClick={()=>window.location.reload()}>Atualizar página</button>}</div>
    </div>
  </Modal></div>,document.body);
}
