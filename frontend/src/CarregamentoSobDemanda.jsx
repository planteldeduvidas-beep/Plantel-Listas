import React, { Suspense } from 'react';
import { Alerta, Carregando } from './ComponentesInterface.jsx';

// Uma falha no download do chunk nao pode apagar o menu nem causar reload automatico.
export class LimiteCarregamento extends React.Component {
  state = { falhou: false };
  static getDerivedStateFromError() { return { falhou: true }; }
  render() {
    if (this.state.falhou) return <section role="region" aria-label="Falha ao carregar tela">
      <Alerta tipo="erro">Não foi possível carregar esta tela. Confira sua conexão e atualize a página para tentar novamente.</Alerta>
      <button type="button" className="botao-secundario" onClick={() => window.location.reload()}>Atualizar página</button>
    </section>;
    return this.props.children;
  }
}

export default function CarregamentoSobDemanda({ children, texto }) {
  return <LimiteCarregamento><Suspense fallback={<Carregando texto={texto || 'Abrindo esta área...'} />}>{children}</Suspense></LimiteCarregamento>;
}
