import React, { useEffect, useState } from "react";
import { consultarAcervo, obterUrlDoMaterial, classificarPasta } from "./api.js";

function tamanhoAmigavel(bytes) {
  if (bytes === null || bytes === undefined) {
    return "Tamanho não informado";
  }
  const unidades = ["B", "KB", "MB", "GB"];
  let valor = Number(bytes);
  let unidade = 0;
  while (valor >= 1024 && unidade < unidades.length - 1) {
    valor /= 1024;
    unidade += 1;
  }
  return (unidade === 0 ? valor : valor.toFixed(valor >= 10 ? 0 : 1)) + " " + unidades[unidade];
}

function nomeDoTipo(tipo) {
  return { pdf: "PDF", video: "Vídeo", outro: "Arquivo" }[tipo] || "Arquivo";
}

function Pasta({ pasta, aoAbrir, usuario, filtros, aoClassificar }) {
  const [editando, definirEditando] = useState(false);
  const [disciplinaId, definirDisciplinaId] = useState(pasta.disciplina ? pasta.disciplina.id : "");
  const [concursoId, definirConcursoId] = useState(pasta.concurso ? pasta.concurso.id : "");

  async function salvar(evento) {
    evento.preventDefault();
    await aoClassificar(pasta.id, disciplinaId, concursoId);
    definirEditando(false);
  }

  return (
    <article className="item-pasta">
      <button type="button" className="abrir-pasta" onClick={function abrir() { aoAbrir(pasta.id); }}>
        <span className="icone-item" aria-hidden="true">📁</span>
        <span><strong>{pasta.nome}</strong><small>{pasta.quantidadePastas} pastas · {pasta.quantidadeMateriais} arquivos</small></span>
      </button>
      {(pasta.disciplina || pasta.concurso) && (
        <div className="etiquetas">
          {pasta.disciplina && <span>{pasta.disciplina.nome}</span>}
          {pasta.concurso && <span>{pasta.concurso.nome}</span>}
        </div>
      )}
      {usuario.papel === "admin" && (
        <div className="classificacao-pasta">
          {!editando && <button type="button" className="acao-texto" onClick={function editar() { definirEditando(true); }}>Identificar conteúdo</button>}
          {editando && (
            <form onSubmit={salvar}>
              <label>Disciplina<select value={disciplinaId} onChange={function mudar(evento) { definirDisciplinaId(evento.target.value); }}><option value="">Não informar</option>{filtros.disciplinas.map(function opcao(item) { return <option key={item.id} value={item.id}>{item.nome}</option>; })}</select></label>
              <label>Concurso<select value={concursoId} onChange={function mudar(evento) { definirConcursoId(evento.target.value); }}><option value="">Não informar</option>{filtros.concursos.map(function opcao(item) { return <option key={item.id} value={item.id}>{item.nome}</option>; })}</select></label>
              <div><button type="submit">Salvar</button><button type="button" className="secundario" onClick={function cancelar() { definirEditando(false); }}>Cancelar</button></div>
            </form>
          )}
        </div>
      )}
    </article>
  );
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

  function carregar() {
    definirCarregando(true);
    definirErro("");
    return consultarAcervo({ categoriaId: categoriaId, busca: busca, tipo: tipo, disciplinaId: disciplinaId, concursoId: concursoId, ordenar: ordenar, pagina: pagina, limite: 24 })
      .then(definirDados)
      .catch(function falhou(falha) { definirErro(falha.message); })
      .finally(function terminou() { definirCarregando(false); });
  }

  useEffect(function atualizar() {
    carregar();
  }, [categoriaId, busca, tipo, disciplinaId, concursoId, ordenar, pagina]);

  function abrirPasta(id) {
    definirCategoriaId(id);
    definirPagina(1);
    definirBusca("");
    definirBuscaDigitada("");
  }

  function pesquisar(evento) {
    evento.preventDefault();
    definirPagina(1);
    definirBusca(buscaDigitada.trim());
  }

  async function salvarClassificacao(id, novaDisciplinaId, novoConcursoId) {
    try {
      await classificarPasta(id, novaDisciplinaId ? Number(novaDisciplinaId) : null, novoConcursoId ? Number(novoConcursoId) : null);
      await carregar();
    } catch (falha) {
      definirErro(falha.message);
    }
  }

  const filtros = dados ? dados.filtros : { disciplinas: [], concursos: [] };

  return (
    <section className="biblioteca" aria-labelledby="titulo-biblioteca">
      <div className="cabecalho-biblioteca">
        <div><h2 id="titulo-biblioteca">Encontre seu material</h2><p>Navegue pelas pastas ou pesquise pelo que precisa estudar.</p></div>
        {usuario.papel === "admin" && dados && <small>{dados.naoClassificados} arquivos ainda precisam de identificação.</small>}
      </div>
      <form className="busca-acervo" onSubmit={pesquisar}>
        <label><span>Buscar no acervo</span><input type="search" value={buscaDigitada} placeholder="Nome do arquivo ou da pasta" onChange={function mudar(evento) { definirBuscaDigitada(evento.target.value); }} /></label>
        <button type="submit">Buscar</button>
      </form>
      <div className="filtros-acervo">
        <label>Tipo<select value={tipo} onChange={function mudar(evento) { definirTipo(evento.target.value); definirPagina(1); }}><option value="">Todos</option><option value="pdf">PDF</option><option value="video">Vídeo</option></select></label>
        <label>Disciplina<select value={disciplinaId} onChange={function mudar(evento) { definirDisciplinaId(evento.target.value); definirPagina(1); }}><option value="">Todas</option>{filtros.disciplinas.map(function opcao(item) { return <option key={item.id} value={item.id}>{item.nome}</option>; })}</select></label>
        <label>Concurso<select value={concursoId} onChange={function mudar(evento) { definirConcursoId(evento.target.value); definirPagina(1); }}><option value="">Todos</option>{filtros.concursos.map(function opcao(item) { return <option key={item.id} value={item.id}>{item.nome}</option>; })}</select></label>
        <label>Ordem<select value={ordenar} onChange={function mudar(evento) { definirOrdenar(evento.target.value); }}><option value="nome_asc">Nome: A a Z</option><option value="nome_desc">Nome: Z a A</option><option value="recente">Mais recentes</option></select></label>
      </div>
      {dados && (
        <nav className="breadcrumb" aria-label="Caminho da pasta">
          <button type="button" onClick={function inicio() { abrirPasta(null); }}>Acervo</button>
          {dados.breadcrumb.map(function parte(item) { return <span key={item.id}><span aria-hidden="true">/</span><button type="button" onClick={function abrir() { abrirPasta(item.id); }}>{item.nome}</button></span>; })}
        </nav>
      )}
      {erro && <p className="aviso erro" role="alert">{erro}</p>}
      {carregando && <p className="estado-vazio">Buscando materiais...</p>}
      {!carregando && dados && (
        <>
          {dados.pastas.length > 0 && <div className="grade-pastas">{dados.pastas.map(function pasta(item) { return <Pasta key={item.id} pasta={item} aoAbrir={abrirPasta} usuario={usuario} filtros={filtros} aoClassificar={salvarClassificacao} />; })}</div>}
          <div className="grade-materiais">
            {dados.materiais.map(function material(item) {
              return (
                <article className="item-material" key={item.id}>
                  <span className="tipo-material">{nomeDoTipo(item.tipo)}</span>
                  <h3>{item.nome}</h3>
                  <p>{item.caminho}</p>
                  <small>{tamanhoAmigavel(item.tamanhoBytes)}</small>
                  <div className="acoes-material">
                    {(item.tipo === "pdf" || item.tipo === "video") && <button type="button" onClick={function visualizar() { definirMaterialAberto(item); }}>{item.tipo === "pdf" ? "Abrir PDF" : "Assistir"}</button>}
                    <a className="botao-secundario" href={obterUrlDoMaterial(item.id, true)}>Baixar</a>
                  </div>
                </article>
              );
            })}
          </div>
          {!dados.pastas.length && !dados.materiais.length && <p className="estado-vazio">Nenhum material encontrado com essas opções.</p>}
          <nav className="paginacao" aria-label="Páginas dos materiais"><button type="button" disabled={dados.paginacao.pagina <= 1} onClick={function anterior() { definirPagina(pagina - 1); }}>Anterior</button><span>Página {dados.paginacao.pagina} de {dados.paginacao.totalPaginas}</span><button type="button" disabled={dados.paginacao.pagina >= dados.paginacao.totalPaginas} onClick={function proxima() { definirPagina(pagina + 1); }}>Próxima</button></nav>
        </>
      )}
      {materialAberto && (
        <div className="visualizador" role="dialog" aria-modal="true" aria-label={materialAberto.nome}>
          <div className="visualizador-cabecalho"><strong>{materialAberto.nome}</strong><button type="button" className="secundario" onClick={function fechar() { definirMaterialAberto(null); }}>Fechar</button></div>
          {materialAberto.tipo === "pdf" ? <iframe title={materialAberto.nome} src={obterUrlDoMaterial(materialAberto.id, false)} /> : <video controls preload="metadata" crossOrigin="use-credentials" src={obterUrlDoMaterial(materialAberto.id, false)}>Seu navegador não consegue reproduzir este vídeo.</video>}
        </div>
      )}
    </section>
  );
}

export default BibliotecaAcervo;
