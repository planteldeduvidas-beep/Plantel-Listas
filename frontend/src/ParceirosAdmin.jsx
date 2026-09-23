import React, { useEffect, useState } from "react";
import { criarParceiro, editarParceiro, enviarImagemParceiro, listarParceirosAdmin, removerImagemParceiro } from "./api.js";
import { Vazio } from "./ComponentesInterface.jsx";

const inicial = { nome: "", descricao: "", link: "", cupom: "", desconto: "", textoBotao: "", ativo: false, ordem: 0 };

function LogoParceiro({ item }) {
  const [falhou, definirFalhou] = useState(false);
  return <span className="lista-parceiros-admin-logo">
    {item.imagemUrl && !falhou
      ? <img src={item.imagemUrl} alt="" onError={() => definirFalhou(true)} />
      : item.nome.slice(0, 1).toUpperCase()}
  </span>;
}

export default function ParceirosAdmin({ aoMensagem, aoErro, aoAlterar }) {
  const [parceiros, definirParceiros] = useState([]);
  const [editando, definirEditando] = useState(null);
  const [dados, definirDados] = useState(inicial);
  const [imagem, definirImagem] = useState(null);
  const [aberto, definirAberto] = useState(false);
  const [salvando, definirSalvando] = useState(false);

  async function carregar() {
    const resposta = await listarParceirosAdmin();
    definirParceiros(resposta.parceiros || []);
  }

  useEffect(() => { carregar().catch(erro => aoErro(erro.message)); }, []);

  function atualizar(campo, valor) { definirDados(atual => ({ ...atual, [campo]: valor })); }
  function fechar() { definirAberto(false); definirEditando(null); definirDados(inicial); definirImagem(null); }
  function editar(item) {
    definirDados({ nome: item.nome, descricao: item.descricao, link: item.link,
      cupom: item.cupom || "", desconto: item.desconto || "", textoBotao: item.textoBotao || "",
      ativo: item.ativo, ordem: item.ordem });
    definirEditando(item);
    definirImagem(null);
    definirAberto(true);
  }

  async function salvar(evento) {
    evento.preventDefault();
    definirSalvando(true);
    let camposSalvos = false;
    try {
      const corpo = { ...dados, cupom: dados.cupom || null, desconto: dados.desconto || null,
        textoBotao: dados.textoBotao || null, ordem: Number(dados.ordem) };
      const resposta = editando ? await editarParceiro(editando.id, corpo) : await criarParceiro(corpo);
      camposSalvos = true;
      definirEditando(resposta.parceiro);
      if (imagem) await enviarImagemParceiro(resposta.parceiro.id, imagem);
      await carregar();
      aoAlterar();
      aoMensagem("Parceiro salvo com sucesso.");
      fechar();
    } catch (erro) {
      if (camposSalvos) {
        await carregar().catch(() => {});
        aoAlterar();
        aoErro("Os dados foram salvos, mas a imagem não foi enviada. Tente selecionar a imagem novamente.");
      } else aoErro(erro.message);
    } finally { definirSalvando(false); }
  }

  async function alternar(item) {
    try {
      await editarParceiro(item.id, { ativo: !item.ativo });
      await carregar();
      aoAlterar();
      aoMensagem(item.ativo ? "Parceiro arquivado." : "Parceiro ativado.");
    } catch (erro) { aoErro(erro.message); }
  }

  async function removerLogo(item) {
    try {
      await removerImagemParceiro(item.id);
      await carregar();
      aoAlterar();
      aoMensagem("Imagem removida.");
    } catch (erro) { aoErro(erro.message); }
  }

  return <section className="bloco-admin painel-conteudo painel-parceiros-admin">
    <div className="cabecalho-bloco"><div><h2>Parceiros Plantel</h2><p>Gerencie os parceiros exibidos na sidebar. Nenhum parceiro é publicado automaticamente.</p></div>
      {!aberto && <button type="button" onClick={() => { definirDados(inicial); definirEditando(null); definirAberto(true); }}>+ Novo parceiro</button>}
    </div>
    {aberto && <form className="formulario-parceiro" onSubmit={salvar}>
      <h3>{editando ? "Editar parceiro" : "Cadastrar parceiro"}</h3>
      <label>Nome<input required maxLength="120" value={dados.nome} onChange={e => atualizar("nome", e.target.value)} /></label>
      <label>Descrição curta<input required maxLength="240" value={dados.descricao} onChange={e => atualizar("descricao", e.target.value)} /></label>
      <label>Link externo HTTPS<input required type="url" maxLength="2048" value={dados.link} onChange={e => atualizar("link", e.target.value)} placeholder="https://..." /></label>
      <div className="formulario-parceiro-linha">
        <label>Cupom (opcional)<input maxLength="80" value={dados.cupom} onChange={e => atualizar("cupom", e.target.value)} /></label>
        <label>Desconto (opcional)<input maxLength="120" value={dados.desconto} onChange={e => atualizar("desconto", e.target.value)} /></label>
      </div>
      <div className="formulario-parceiro-linha">
        <label>Texto do botão (opcional)<input maxLength="60" value={dados.textoBotao} onChange={e => atualizar("textoBotao", e.target.value)} placeholder="Conhecer parceiro" /></label>
        <label>Ordem<input type="number" min="0" max="100000" value={dados.ordem} onChange={e => atualizar("ordem", e.target.value)} /></label>
      </div>
      <label>Logo (PNG, JPEG ou WebP; até 512 KB)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => definirImagem(e.target.files[0] || null)} /></label>
      <label className="formulario-parceiro-ativo"><input type="checkbox" checked={dados.ativo} onChange={e => atualizar("ativo", e.target.checked)} />Exibir na sidebar</label>
      <div className="acoes-formulario"><button type="submit" disabled={salvando}>{salvando ? "Salvando..." : "Salvar parceiro"}</button>
        <button type="button" className="secundario" onClick={fechar} disabled={salvando}>Cancelar</button></div>
    </form>}
    <ul className="lista-parceiros-admin">
      {parceiros.map(item => <li key={item.id}>
        <LogoParceiro item={item} />
        <span className="lista-parceiros-admin-identidade"><strong>{item.nome}</strong><small>Ordem {item.ordem} · {item.ativo ? "Ativo" : "Arquivado"}</small><small>{item.descricao}</small></span>
        <span className="lista-parceiros-admin-acoes"><button type="button" className="secundario" onClick={() => editar(item)}>Editar</button>
          <button type="button" className="secundario" onClick={() => alternar(item)}>{item.ativo ? "Arquivar" : "Ativar"}</button>
          {item.imagemUrl && <button type="button" className="secundario" onClick={() => removerLogo(item)}>Remover logo</button>}</span>
      </li>)}
    </ul>
    {!parceiros.length && <Vazio titulo="Nenhum parceiro cadastrado" texto="Cadastre e ative um parceiro para exibi-lo na sidebar." />}
  </section>;
}
