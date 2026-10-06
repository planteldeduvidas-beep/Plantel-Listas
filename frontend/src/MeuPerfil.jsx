import React, { useEffect, useState } from 'react';
import { obterPerfilAluno, atualizarPerfilAluno } from './api.js';
import { CampoFaixaEtaria } from './FaixaEtariaAluno.jsx';
import { FormularioEmailConta } from './EmailConta.jsx';
import { Alerta, mensagemHumana } from './ComponentesInterface.jsx';

function dataLegivel(valor) { return valor ? new Date(valor).toLocaleString('pt-BR') : 'Não registrado'; }
const ORIGENS = { cadastro: 'Cadastro', coleta_obrigatoria: 'Primeira declaração no acesso', perfil: 'Atualização no perfil', admin: 'Correção pela equipe' };
export function faixaBloqueadaNoPerfil(faixa) { return ['menos_12','12_17'].includes(faixa); }
export default function MeuPerfil({ usuario, aoAtualizarUsuario }) {
  const [dados, definirDados] = useState(null), [nome, definirNome] = useState(''), [faixa, definirFaixa] = useState('');
  const [erro, definirErro] = useState(''), [mensagem, definirMensagem] = useState(''), [salvando, definirSalvando] = useState(false);
  const [tentativa, definirTentativa] = useState(0);
  const faixaProtegida = faixaBloqueadaNoPerfil(dados?.faixaEtaria);
  useEffect(() => {
    let ativo = true; definirErro('');
    obterPerfilAluno().then(d => { if (ativo) { definirDados(d); definirNome(d.nome); definirFaixa(d.faixaEtaria || ''); } }).catch(e => { if (ativo) definirErro(mensagemHumana(e)); });
    return () => { ativo = false; };
  }, [usuario.id, usuario.email, tentativa]);
  async function salvar(e) {
    e.preventDefault(); if (salvando) return;
    definirSalvando(true); definirErro(''); definirMensagem('');
    try { await atualizarPerfilAluno(nome, faixa); const d = await obterPerfilAluno(); definirDados(d); definirNome(d.nome); definirFaixa(d.faixaEtaria); aoAtualizarUsuario?.({ ...usuario, nome: d.nome }); definirMensagem('Perfil atualizado. Seu acesso e histórico continuam iguais.'); }
    catch (f) { definirErro(mensagemHumana(f)); }
    finally { definirSalvando(false); }
  }
  return <section className="bloco-admin meu-perfil faixa-etaria-aluno"><h2>Meus dados</h2><p>Confira suas informações e mantenha um e-mail ao qual você tenha acesso.</p>
    {erro && <Alerta tipo="erro">{erro}</Alerta>}{mensagem && <Alerta tipo="sucesso">{mensagem}</Alerta>}
    {!dados ? <>{!erro ? <p>Carregando seu perfil…</p> : <button onClick={() => definirTentativa(t => t + 1)}>Tentar novamente</button>}</> : <>
      <dl className="resumo-meu-perfil"><div><dt>E-mail atual</dt><dd>{dados.email}</dd></div><div><dt>Confirmação do e-mail</dt><dd>{dados.emailConfirmado ? 'Confirmado' : 'Ainda não confirmado'}</dd></div><div><dt>Conta criada em</dt><dd>{dataLegivel(dados.criadoEm)}</dd></div><div><dt>Faixa declarada em</dt><dd>{dataLegivel(dados.declaradaEm)}</dd></div><div><dt>Origem da declaração</dt><dd>{ORIGENS[dados.origem] || 'Não registrada'}</dd></div></dl>
      <form onSubmit={salvar}><label>Nome<input value={nome} onChange={e => definirNome(e.target.value)} minLength={2} maxLength={120} required autoComplete="name" disabled={salvando} /></label>
        <CampoFaixaEtaria valor={faixa} aoAlterar={definirFaixa} desabilitado={salvando || faixaProtegida} />
        <p className="texto-ajuda">{faixaProtegida ? 'Para corrigir sua faixa etária, peça uma revisão ao Suporte. Você pode continuar estudando e atualizar seu nome normalmente.' : 'Você pode corrigir sua faixa declarada. Se escolher uma faixa abaixo de 18 anos, próximas correções precisarão de revisão pelo Suporte.'}</p>
        {faixaProtegida && <a className="botao-secundario" href="?area=suporte">Solicitar correção ao Suporte</a>}
        <div className="acoes-faixa-etaria"><button className="botao-principal" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar meus dados'}</button></div>
      </form><details className="email-no-perfil"><summary>Atualizar ou confirmar meu e-mail</summary><FormularioEmailConta usuario={usuario} /></details>
      {(faixa === 'menos_12' || faixa === '12_17') && <p>Peça orientação a um responsável para usar a plataforma com segurança. Parceiros não são escolhidos pelo seu histórico, idade ou buscas. Você continua tendo acesso aos materiais de estudo.</p>}
    </>}
  </section>;
}
