import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ExigirFaixaEtariaAluno from '../../src/ExigirFaixaEtariaAluno.jsx';
import MeuPerfil from '../../src/MeuPerfil.jsx';
import '../../src/styles.css';

function Cenário() {
  const [usuario, atualizar] = useState({ id: 1, papel: 'aluno', nome: 'Aluno Visual', email: 'qa@example.com' });
  return <ExigirFaixaEtariaAluno usuario={usuario}><main style={{maxWidth:'900px',margin:'auto',padding:'16px'}}><h1>Meu perfil — QA local</h1><MeuPerfil usuario={usuario} aoAtualizarUsuario={atualizar} /></main></ExigirFaixaEtariaAluno>;
}
createRoot(document.getElementById('root')).render(<Cenário />);
