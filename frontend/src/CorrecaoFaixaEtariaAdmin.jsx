import React, { useEffect, useState } from 'react';
import { obterFaixaEtariaUsuario, corrigirFaixaEtariaUsuario } from './api.js';
import { CampoFaixaEtaria } from './FaixaEtariaAluno.jsx';
import { Alerta, Modal, mensagemHumana } from './ComponentesInterface.jsx';
import faixas from '../../shared/faixasEtarias.json';

export default function CorrecaoFaixaEtariaAdmin({ aluno, aoFechar, aoConcluir }) {
  const [dados, definirDados] = useState(null), [valor, definirValor] = useState(''), [motivo, definirMotivo] = useState('');
  const [erro, definirErro] = useState(''), [ocupado, definirOcupado] = useState(false);
  useEffect(() => {
    let ativo = true;
    obterFaixaEtariaUsuario(aluno.id).then(d => { if (ativo) { definirDados(d); definirValor(d.faixaEtaria || ''); } }).catch(e => { if (ativo) definirErro(mensagemHumana(e)); });
    return () => { ativo = false; };
  }, [aluno.id]);
  async function salvar(e) {
    e.preventDefault(); if (ocupado || !dados) return;
    definirOcupado(true); definirErro('');
    try { const r = await corrigirFaixaEtariaUsuario(aluno.id,valor,motivo); aoConcluir(r.mensagem); }
    catch (f) { definirErro(mensagemHumana(f)); }
    finally { definirOcupado(false); }
  }
  return <Modal titulo="Revisar faixa etária declarada" aoFechar={ocupado ? () => {} : aoFechar}>
    <p><strong>{aluno.nome}</strong></p><p>Revise a solicitação pelo Suporte antes de corrigir. A mudança mantém a conta e o histórico e será registrada com faixa anterior, nova faixa, horário, administrador e justificativa. Não trate a declaração como idade comprovada.</p>
    {dados && <><p>Faixa atual: <strong>{faixas.find(f => f.valor === dados.faixaEtaria)?.rotulo || 'Ainda não declarada'}</strong></p>
      <form onSubmit={salvar}><CampoFaixaEtaria valor={valor} aoAlterar={definirValor} desabilitado={ocupado} />
        <label>Justificativa da correção<textarea value={motivo} onChange={e => definirMotivo(e.target.value)} minLength={5} maxLength={500} required disabled={ocupado} /></label>
        <small>Registre o motivo da revisão, sem senhas, documentos ou outros dados sensíveis.</small>
        <div className="acoes-faixa-etaria"><button className="botao-principal" disabled={ocupado || !valor || valor === dados.faixaEtaria}>{ocupado ? 'Salvando…' : 'Confirmar correção'}</button><button type="button" className="botao-secundario" disabled={ocupado} onClick={aoFechar}>Cancelar</button></div>
      </form></>}
    {!dados && !erro && <p>Conferindo a declaração atual…</p>}{erro && <Alerta tipo="erro">{erro}</Alerta>}
  </Modal>;
}
