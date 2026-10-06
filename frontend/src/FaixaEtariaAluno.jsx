import React from 'react';
import faixas from '../../shared/faixasEtarias.json';
import './faixaEtaria.css';

export function CampoFaixaEtaria({ valor, aoAlterar, desabilitado = false, explicar = true }) {
  return <label>Qual é sua faixa etária?
    <select value={valor} onChange={e => aoAlterar(e.target.value)} required disabled={desabilitado}>
      <option value="">Selecione uma opção</option>
      {faixas.map(faixa => <option key={faixa.valor} value={faixa.valor}>{faixa.rotulo}</option>)}
    </select>
    {explicar && <small>Usamos essa informação para orientar os cuidados adequados à idade. Não pedimos sua data de nascimento ou documentos. A resposta é declarada, não uma comprovação de idade.</small>}
  </label>;
}
