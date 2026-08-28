import React, { useEffect, useState } from "react";
import {
  consultarAcervo, obterUrlDoMaterial, classificarPasta,
  obterOrganizacaoAcervo, classificarPastas, listarPastasGerenciaveis,
  adicionarMaterial, editarMaterial, moverMaterial, substituirMaterial,
  enviarMaterialLixeira, listarLixeira, restaurarMaterial, excluirMaterial
} from "./api.js";

function tamanhoAmigavel(bytes) {
  if (bytes === null || bytes === undefined) return "Tamanho não informado";
  const unidades = ["B", "KB", "MB", "GB"];
  let valor = Number(bytes);
  let unidade = 0;
  while (valor >= 1024 && unidade < unidades.length - 1) { valor /= 1024; unidade += 1; }
  return (unidade === 0 ? valor : valor.toFixed(valor >= 10 ? 0 : 1)) + " " + unidades[unidade];
}

function nomeDoTipo(tipo) { return { pdf: "PDF", video: "Vídeo" }[tipo] || "Arquivo"; }

function lerEscolha(valor) {
  if (["herdar", "nao_se_aplica"].includes(valor)) return { estado: valor, id: null };
  if (String(valor).startsWith("definida:")) return { estado: "definida", id: Number(valor.split(":")[1]) };
  return null;
}

function valorInicial(pasta, dimensao) {
  const estado = pasta[dimensao + "Estado"];
  return estado === "definida" && pasta[dimensao] ? "definida:" + pasta[dimensao].id : (estado || "herdar");
}

function OpcoesClassificacao({ itens, incluirManter }) {
  return <>{incluirManter && <option value="manter">Manter como está</option>}<option value="herdar">Usar a organização da pasta acima</option><option value="nao_se_aplica">Não se aplica</option>{itens.map(function opcao(item) { return <option key={item.id} value={"definida:" + item.id}>{item.nome}</option>; })}</>;
}

function PainelGestaoMateriais({ usuario, filtros, categoriaAtual, pastas, aoAtualizar, aoErro }) {
  const [lixeira, definirLixeira] = useState([]);
  const [mostrarEnvio, definirMostrarEnvio] = useState(false);
  const [ocupado, definirOcupado] = useState(false);

  function carregarLixeira() {
    if (usuario.papel !== "admin") return Promise.resolve();
    return listarLixeira().then(definirLixeira);
  }

  useEffect(function carregarGestao() {
    carregarLixeira().catch(function falhou(falha) { aoErro(falha.message); });
  }, []);

  async function executar(acao, mensagem) {
    definirOcupado(true);
    aoErro("");
    try {
      await acao();
      await Promise.all([aoAtualizar(), carregarLixeira()]);
      if (mensagem) window.alert(mensagem);
    } catch (falha) {
      aoErro(falha.message);
    } finally {
      definirOcupado(false);
    }
  }

  async function enviar(evento) {
    evento.preventDefault();
    const formulario = new FormData(evento.currentTarget);
    await executar(function adicionar() { return adicionarMaterial(formulario); }, "Material adicionado.");
    evento.currentTarget.reset();
    definirMostrarEnvio(false);
  }

  async function restaurar(item) {
    await executar(function restaurarSelecionado() { return restaurarMaterial(item.id, item.versao); }, "Material restaurado.");
  }

  async function excluir(item) {
    const confirmacao = window.prompt("Esta ação apaga o arquivo definitivamente. Digite EXCLUIR para confirmar.");
    if (confirmacao !== "EXCLUIR") return;
    await executar(function excluirSelecionado() { return excluirMaterial(item.id, item.versao); }, "Material excluído definitivamente.");
  }

  return <section className="painel-gestao-materiais">
    <div className="cabecalho-gestao-materiais"><div><h3>Gerenciar materiais</h3><p>{usuario.papel === "professor" ? "Adicione e organize materiais nas pastas que você pode gerenciar." : "Adicione e organize os materiais do acervo."}</p></div><button type="button" onClick={function alternar() { definirMostrarEnvio(!mostrarEnvio); }}>{mostrarEnvio ? "Cancelar" : "+ Adicionar material"}</button></div>
    {mostrarEnvio && <form className="formulario-material" onSubmit={enviar}><label>Arquivo PDF ou vídeo<input required type="file" name="arquivo" accept="application/pdf,video/mp4,video/webm,.m4v" /></label><label>Adicionar na pasta<select required name="categoriaId" defaultValue={categoriaAtual && pastas.some(function mesma(item) { return item.id === categoriaAtual; }) ? categoriaAtual : ""}><option value="" disabled>Escolha uma pasta</option>{pastas.map(function opcao(item) { return <option key={item.id} value={item.id}>{item.caminho}</option>; })}</select></label><label>Nome do material <small>(opcional)</small><input name="nome" placeholder="Usar o nome do arquivo" /></label><label>Disciplina <small>(opcional)</small><select name="disciplinaId" defaultValue=""><option value="">Não informar</option>{filtros.disciplinas.map(function opcao(item) { return <option key={item.id} value={item.id}>{item.nome}</option>; })}</select></label><label>Concurso <small>(opcional)</small><select name="concursoId" defaultValue=""><option value="">Não informar</option>{filtros.concursos.map(function opcao(item) { return <option key={item.id} value={item.id}>{item.nome}</option>; })}</select></label><button type="submit" disabled={ocupado}>{ocupado ? "Enviando..." : "Adicionar material"}</button></form>}
    {usuario.papel === "admin" && <details className="lixeira-materiais"><summary>Lixeira ({lixeira.length})</summary>{!lixeira.length && <p>Nenhum material na lixeira.</p>}{lixeira.map(function itemLixeira(item) { return <article key={item.id}><div><strong>{item.nome}</strong><small>{item.pasta ? "Pasta anterior: " + item.pasta : "Pasta anterior indisponível"}</small>{item.exclusaoPendente && <small>Exclusão aguardando conclusão</small>}</div><div><button type="button" className="secundario" disabled={ocupado || item.exclusaoPendente} onClick={function restaurarItem() { restaurar(item); }}>Restaurar</button><button type="button" className="perigo" disabled={ocupado} onClick={function excluirItem() { excluir(item); }}>{item.exclusaoPendente ? "Finalizar exclusão" : "Excluir definitivamente"}</button></div></article>; })}</details>}
  </section>;
}

function AcoesDeGestao({ material, pastas, aoAtualizar, aoErro }) {
  const [movendo, definirMovendo] = useState(false);
  const [destino, definirDestino] = useState("");
  const [substituindo, definirSubstituindo] = useState(false);
  const [ocupado, definirOcupado] = useState(false);

  async function executar(acao) {
    definirOcupado(true); aoErro("");
    try { await acao(); await aoAtualizar(); } catch (falha) { aoErro(falha.message); }
    finally { definirOcupado(false); }
  }

  async function editar() {
    const nome = window.prompt("Novo nome do material:", material.nome);
    if (!nome || nome === material.nome) return;
    await executar(function salvar() { return editarMaterial(material.id, { nome: nome, versao: material.versao }); });
  }

  async function mover(evento) {
    evento.preventDefault();
    await executar(function salvar() { return moverMaterial(material.id, Number(destino), material.versao); });
    definirMovendo(false);
  }

  async function substituir(evento) {
    evento.preventDefault();
    const formulario = new FormData(evento.currentTarget);
    formulario.set("versao", String(material.versao));
    await executar(function salvar() { return substituirMaterial(material.id, formulario); });
    definirSubstituindo(false);
  }

  async function lixeira() {
    if (!window.confirm("Enviar este material para a lixeira?")) return;
    await executar(function enviar() { return enviarMaterialLixeira(material.id, material.versao); });
  }

  return <div className="gestao-item-material"><div className="acoes-gestao-item"><button type="button" className="acao-texto" disabled={ocupado} onClick={editar}>Editar nome</button><button type="button" className="acao-texto" disabled={ocupado} onClick={function mostrar() { definirMovendo(!movendo); definirSubstituindo(false); }}>Mover</button><button type="button" className="acao-texto" disabled={ocupado} onClick={function mostrar() { definirSubstituindo(!substituindo); definirMovendo(false); }}>Substituir arquivo</button><button type="button" className="acao-texto perigo-texto" disabled={ocupado} onClick={lixeira}>Enviar para lixeira</button></div>{movendo && <form className="acao-inline" onSubmit={mover}><label>Mover para<select required value={destino} onChange={function mudar(evento) { definirDestino(evento.target.value); }}><option value="" disabled>Escolha uma pasta</option>{pastas.filter(function diferente(item) { return item.id !== material.categoriaId; }).map(function opcao(item) { return <option key={item.id} value={item.id}>{item.caminho}</option>; })}</select></label><button type="submit" disabled={ocupado}>Mover material</button></form>}{substituindo && <form className="acao-inline" onSubmit={substituir}><label>Novo PDF ou vídeo<input required type="file" name="arquivo" accept="application/pdf,video/mp4,video/webm,.m4v" /></label><button type="submit" disabled={ocupado}>Substituir</button></form>}</div>;
}

function Pasta({ pasta, aoAbrir, usuario, filtros, aoClassificar }) {
  const [editando, definirEditando] = useState(false);
  const [disciplina, definirDisciplina] = useState(valorInicial(pasta, "disciplina"));
  const [concurso, definirConcurso] = useState(valorInicial(pasta, "concurso"));
  async function salvar(evento) {
    evento.preventDefault();
    await aoClassificar(pasta.id, lerEscolha(disciplina), lerEscolha(concurso));
    definirEditando(false);
  }
  return <article className="item-pasta">
    <button type="button" className="abrir-pasta" onClick={function abrir() { aoAbrir(pasta.id); }}><span className="icone-item" aria-hidden="true">📁</span><span><strong>{pasta.nome}</strong><small>{pasta.quantidadePastas} pastas · {pasta.quantidadeMateriais} arquivos</small></span></button>
    {(pasta.disciplina || pasta.concurso) && <div className="etiquetas">{pasta.disciplina && <span>{pasta.disciplina.nome}</span>}{pasta.concurso && <span>{pasta.concurso.nome}</span>}</div>}
    {usuario.papel === "admin" && <div className="classificacao-pasta">{!editando && <button type="button" className="acao-texto" onClick={function editar() { definirEditando(true); }}>Organizar pasta</button>}{editando && <form onSubmit={salvar}><label>Disciplina<select value={disciplina} onChange={function mudar(evento) { definirDisciplina(evento.target.value); }}><OpcoesClassificacao itens={filtros.disciplinas} /></select></label><label>Concurso<select value={concurso} onChange={function mudar(evento) { definirConcurso(evento.target.value); }}><OpcoesClassificacao itens={filtros.concursos} /></select></label><div><button type="submit">Salvar</button><button type="button" className="secundario" onClick={function cancelar() { definirEditando(false); }}>Cancelar</button></div></form>}</div>}
  </article>;
}

function BibliotecaAcervo({ usuario }) {
  const [dados, definirDados] = useState(null);
  const [categoriaId, definirCategoriaId] = useState(null);
  const [buscaDigitada, definirBuscaDigitada] = useState("");
  const [busca, definirBusca] = useState("");
  const [tipo, definirTipo] = useState("");
  const [disciplinaId, definirDisciplinaId] = useState("");
  const [concursoId, definirConcursoId] = useState("");
  const [ordenar, definirOrdenar] = useState("nome_asc");
  const [pagina, definirPagina] = useState(1);
  const [carregando, definirCarregando] = useState(true);
  const [erro, definirErro] = useState("");
  const [materialAberto, definirMaterialAberto] = useState(null);
  const [organizacao, definirOrganizacao] = useState(null);
  const [selecionadas, definirSelecionadas] = useState([]);
  const [disciplinaLote, definirDisciplinaLote] = useState("manter");
  const [concursoLote, definirConcursoLote] = useState("manter");
  const [pastasGerenciaveis, definirPastasGerenciaveis] = useState([]);

  function carregar() {
    definirCarregando(true); definirErro("");
    return consultarAcervo({ categoriaId, busca, tipo, disciplinaId, concursoId, ordenar, pagina, limite: 24 }).then(definirDados).catch(function falhou(falha) { definirErro(falha.message); }).finally(function terminou() { definirCarregando(false); });
  }
  function carregarOrganizacao() { return usuario.papel === "admin" ? obterOrganizacaoAcervo().then(definirOrganizacao) : Promise.resolve(); }
  function carregarPastasGerenciaveis() { return ["professor", "admin"].includes(usuario.papel) ? listarPastasGerenciaveis().then(definirPastasGerenciaveis) : Promise.resolve(); }
  function recarregarTudo() { return Promise.all([carregar(), carregarOrganizacao(), carregarPastasGerenciaveis()]); }
  useEffect(function atualizar() { carregar(); }, [categoriaId, busca, tipo, disciplinaId, concursoId, ordenar, pagina]);
  useEffect(function organizacaoInicial() { carregarOrganizacao().catch(function falhou(falha) { definirErro(falha.message); }); }, []);
  useEffect(function gestaoInicial() { carregarPastasGerenciaveis().catch(function falhou(falha) { definirErro(falha.message); }); }, []);
  function abrirPasta(id) { definirCategoriaId(id); definirPagina(1); definirBusca(""); definirBuscaDigitada(""); }
  function pesquisar(evento) { evento.preventDefault(); definirPagina(1); definirBusca(buscaDigitada.trim()); }
  async function salvarClassificacao(id, disciplina, concurso) {
    try { await classificarPasta(id, disciplina, concurso); await Promise.all([carregar(), carregarOrganizacao()]); } catch (falha) { definirErro(falha.message); }
  }
  function alternar(id) { definirSelecionadas(function atualizar(atuais) { return atuais.includes(id) ? atuais.filter(function remover(item) { return item !== id; }) : atuais.concat(id); }); }
  async function salvarLote(evento) {
    evento.preventDefault();
    if (!selecionadas.length || (disciplinaLote === "manter" && concursoLote === "manter")) { definirErro("Selecione ao menos uma pasta e uma opção de organização."); return; }
    try {
      await classificarPastas(selecionadas, disciplinaLote === "manter" ? null : lerEscolha(disciplinaLote), concursoLote === "manter" ? null : lerEscolha(concursoLote));
      definirSelecionadas([]); definirDisciplinaLote("manter"); definirConcursoLote("manter");
      await Promise.all([carregar(), carregarOrganizacao()]);
    } catch (falha) { definirErro(falha.message); }
  }
  const filtros = dados ? dados.filtros : { disciplinas: [], concursos: [] };

  return <section className="biblioteca" aria-labelledby="titulo-biblioteca">
    <div className="cabecalho-biblioteca"><div><h2 id="titulo-biblioteca">Encontre seu material</h2><p>Navegue pelas pastas ou pesquise pelo que precisa estudar.</p></div>{usuario.papel === "admin" && organizacao && <small>{organizacao.pastasPendentes.length ? organizacao.pastasPendentes.length + " pastas ainda precisam de organização." : "Todo o acervo está organizado."}</small>}</div>
    {["professor", "admin"].includes(usuario.papel) && <PainelGestaoMateriais usuario={usuario} filtros={filtros} categoriaAtual={categoriaId} pastas={pastasGerenciaveis} aoAtualizar={recarregarTudo} aoErro={definirErro} />}
    {usuario.papel === "admin" && organizacao && organizacao.pastasPendentes.length > 0 && <form className="organizacao-lote" onSubmit={salvarLote}><div><h3>Organizar pastas pendentes</h3><p>Escolha uma ou mais pastas. A organização vale para os conteúdos dentro delas.</p></div><div className="lista-pastas-pendentes">{organizacao.pastasPendentes.map(function pastaPendente(item) { return <label key={item.id}><input type="checkbox" checked={selecionadas.includes(item.id)} onChange={function mudar() { alternar(item.id); }} /><span><strong>{item.caminho}</strong><small>{item.quantidadeMateriais} materiais nesta pasta</small></span></label>; })}</div><div className="campos-lote"><label>Disciplina<select value={disciplinaLote} onChange={function mudar(evento) { definirDisciplinaLote(evento.target.value); }}><OpcoesClassificacao itens={filtros.disciplinas} incluirManter /></select></label><label>Concurso<select value={concursoLote} onChange={function mudar(evento) { definirConcursoLote(evento.target.value); }}><OpcoesClassificacao itens={filtros.concursos} incluirManter /></select></label><button type="submit">Organizar pastas selecionadas</button></div></form>}
    <form className="busca-acervo" onSubmit={pesquisar}><label><span>Buscar no acervo</span><input type="search" value={buscaDigitada} placeholder="Nome do arquivo ou da pasta" onChange={function mudar(evento) { definirBuscaDigitada(evento.target.value); }} /></label><button type="submit">Buscar</button></form>
    <div className="filtros-acervo"><label>Tipo<select value={tipo} onChange={function mudar(evento) { definirTipo(evento.target.value); definirPagina(1); }}><option value="">Todos</option><option value="pdf">PDF</option><option value="video">Vídeo</option></select></label><label>Disciplina<select value={disciplinaId} onChange={function mudar(evento) { definirDisciplinaId(evento.target.value); definirPagina(1); }}><option value="">Todas</option>{filtros.disciplinas.map(function opcao(item) { return <option key={item.id} value={item.id}>{item.nome}</option>; })}</select></label><label>Concurso<select value={concursoId} onChange={function mudar(evento) { definirConcursoId(evento.target.value); definirPagina(1); }}><option value="">Todos</option>{filtros.concursos.map(function opcao(item) { return <option key={item.id} value={item.id}>{item.nome}</option>; })}</select></label><label>Ordem<select value={ordenar} onChange={function mudar(evento) { definirOrdenar(evento.target.value); }}><option value="nome_asc">Nome: A a Z</option><option value="nome_desc">Nome: Z a A</option><option value="recente">Mais recentes</option></select></label></div>
    {dados && <nav className="breadcrumb" aria-label="Caminho da pasta"><button type="button" onClick={function inicio() { abrirPasta(null); }}>Acervo</button>{dados.breadcrumb.map(function parte(item) { return <span key={item.id}><span aria-hidden="true">/</span><button type="button" onClick={function abrir() { abrirPasta(item.id); }}>{item.nome}</button></span>; })}</nav>}
    {erro && <p className="aviso erro" role="alert">{erro}</p>}{carregando && <p className="estado-vazio">Buscando materiais...</p>}
    {!carregando && dados && <>{dados.pastas.length > 0 && <div className="grade-pastas">{dados.pastas.map(function pasta(item) { return <Pasta key={item.id} pasta={item} aoAbrir={abrirPasta} usuario={usuario} filtros={filtros} aoClassificar={salvarClassificacao} />; })}</div>}<div className="grade-materiais">{dados.materiais.map(function material(item) { const podeGerenciar = usuario.papel === "admin" || (usuario.papel === "professor" && pastasGerenciaveis.some(function mesmaPasta(pasta) { return pasta.id === item.categoriaId; })); return <article className="item-material" key={item.id}><span className="tipo-material">{nomeDoTipo(item.tipo)}</span><h3>{item.nome}</h3><p>{item.caminho}</p><small>{tamanhoAmigavel(item.tamanhoBytes)}</small><div className="acoes-material"><button type="button" onClick={function visualizar() { definirMaterialAberto(item); }}>{item.tipo === "pdf" ? "Abrir PDF" : "Assistir"}</button><a className="botao-secundario" href={obterUrlDoMaterial(item.id, true)}>Baixar</a></div>{podeGerenciar && <AcoesDeGestao material={item} pastas={pastasGerenciaveis} aoAtualizar={recarregarTudo} aoErro={definirErro} />}</article>; })}</div>{!dados.pastas.length && !dados.materiais.length && <p className="estado-vazio">Nenhum material encontrado com essas opções.</p>}<nav className="paginacao" aria-label="Páginas dos materiais"><button type="button" disabled={dados.paginacao.pagina <= 1} onClick={function anterior() { definirPagina(pagina - 1); }}>Anterior</button><span>Página {dados.paginacao.pagina} de {dados.paginacao.totalPaginas}</span><button type="button" disabled={dados.paginacao.pagina >= dados.paginacao.totalPaginas} onClick={function proxima() { definirPagina(pagina + 1); }}>Próxima</button></nav></>}
    {materialAberto && <div className="visualizador" role="dialog" aria-modal="true" aria-label={materialAberto.nome}><div className="visualizador-cabecalho"><strong>{materialAberto.nome}</strong><button type="button" className="secundario" onClick={function fechar() { definirMaterialAberto(null); }}>Fechar</button></div>{materialAberto.tipo === "pdf" ? <iframe title={materialAberto.nome} src={obterUrlDoMaterial(materialAberto.id, false)} /> : <video controls preload="metadata" crossOrigin="use-credentials" src={obterUrlDoMaterial(materialAberto.id, false)}>Seu navegador não consegue reproduzir este vídeo.</video>}</div>}
  </section>;
}

export default BibliotecaAcervo;
