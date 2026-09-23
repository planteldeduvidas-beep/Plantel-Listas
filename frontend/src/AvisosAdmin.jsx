import React, { useEffect, useState } from "react";
import { criarAviso, editarAviso, listarAvisosAdmin } from "./api.js";
import { Vazio } from "./ComponentesInterface.jsx";
import FaixaAvisos from "./FaixaAvisos.jsx";

const inicial = { texto: "", ativo: false, ordem: 0 };

export default function AvisosAdmin({ aoMensagem, aoErro }) {
  const [avisos, definirAvisos] = useState([]);
  const [editando, definirEditando] = useState(null);
  const [dados, definirDados] = useState(inicial);
  const [aberto, definirAberto] = useState(false);
  const [salvando, definirSalvando] = useState(false);

  async function carregar() {
    const resposta = await listarAvisosAdmin();
    definirAvisos(resposta.avisos || []);
  }

  useEffect(() => { carregar().catch(erro => aoErro(erro.message)); }, []);

  function fechar() { definirAberto(false); definirEditando(null); definirDados(inicial); }
  function editar(item) { definirEditando(item); definirDados({ texto: item.texto, ativo: item.ativo, ordem: item.ordem }); definirAberto(true); }

  async function salvar(evento) {
    evento.preventDefault();
    definirSalvando(true);
    try {
      const corpo = { ...dados, ordem: Number(dados.ordem) };
      if (editando) await editarAviso(editando.id, corpo);
      else await criarAviso(corpo);
      await carregar();
      aoMensagem("Aviso salvo com sucesso.");
      fechar();
    } catch (erro) { aoErro(erro.message); }
    finally { definirSalvando(false); }
  }

  async function alternar(item) {
    try {
      await editarAviso(item.id, { ativo: !item.ativo });
      await carregar();
      aoMensagem(item.ativo ? "Aviso arquivado." : "Aviso ativado.");
    } catch (erro) { aoErro(erro.message); }
  }

  const ativos = avisos.filter(item => item.ativo);
  return <section className="bloco-admin painel-conteudo painel-avisos-admin">
    <div className="cabecalho-bloco"><div><h2>Avisos da biblioteca</h2><p>Mensagens curtas para a faixa exibida aos alunos. Nada é publicado automaticamente.</p></div>
      {!aberto && <button type="button" onClick={() => { definirEditando(null); definirDados(inicial); definirAberto(true); }}>+ Novo aviso</button>}
    </div>
    {aberto && <form className="formulario-aviso" onSubmit={salvar}>
      <h3>{editando ? "Editar aviso" : "Criar aviso"}</h3>
      <label>Texto do aviso<input required maxLength="160" value={dados.texto}
        onChange={evento => definirDados(atual => ({ ...atual, texto: evento.target.value }))}
        placeholder="Ex.: Novo material disponível na biblioteca" /></label>
      <div className="formulario-aviso-opcoes">
        <label>Ordem<input type="number" min="0" max="100000" value={dados.ordem}
          onChange={evento => definirDados(atual => ({ ...atual, ordem: evento.target.value }))} /></label>
        <label className="formulario-aviso-ativo"><input type="checkbox" checked={dados.ativo}
          onChange={evento => definirDados(atual => ({ ...atual, ativo: evento.target.checked }))} />Exibir aos alunos</label>
      </div>
      <div className="acoes-formulario"><button type="submit" disabled={salvando}>{salvando ? "Salvando..." : "Salvar aviso"}</button>
        <button type="button" className="secundario" disabled={salvando} onClick={fechar}>Cancelar</button></div>
    </form>}
    {!!ativos.length && <div className="previa-avisos"><h3>Prévia da faixa</h3><FaixaAvisos avisos={ativos} /></div>}
    <ul className="lista-avisos-admin">{avisos.map(item => <li key={item.id}>
      <span><strong>{item.texto}</strong><small>Ordem {item.ordem} · {item.ativo ? "Ativo" : "Arquivado"}</small></span>
      <div className="lista-avisos-admin-acoes"><button type="button" className="secundario" onClick={() => editar(item)}>Editar</button>
        <button type="button" className="secundario" onClick={() => alternar(item)}>{item.ativo ? "Arquivar" : "Ativar"}</button></div>
    </li>)}</ul>
    {!avisos.length && <Vazio titulo="Nenhum aviso cadastrado" texto="Cadastre e ative um aviso para exibir a faixa aos alunos." />}
  </section>;
}
