import React, { useEffect, useState } from "react";
import {
  listarEstruturaPublica,
  listarUsuarios,
  categorias as apiCategorias,
  disciplinas as apiDisciplinas,
  concursos as apiConcursos,
  listarPermissoes,
  listarMinhasPermissoes,
  concederPermissao,
  revogarPermissao
} from "./api.js";

function ListaDeCategorias({ categorias }) {
  if (!categorias.length) {
    return <p className="estado-vazio">Nenhuma categoria ativa cadastrada.</p>;
  }

  return (
    <ul className="arvore-categorias">
      {categorias.map(function renderizarCategoria(categoria) {
        return (
          <li key={categoria.id}>
            <strong>{categoria.nome}</strong>
            {categoria.descricao && <span>{categoria.descricao}</span>}
            {categoria.filhas.length > 0 && (
              <ListaDeCategorias categorias={categoria.filhas} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function FormularioCatalogo({ titulo, registros, api, aoAtualizar, aoErro }) {
  const [id, definirId] = useState(null);
  const [nome, definirNome] = useState("");
  const [descricao, definirDescricao] = useState("");

  function limpar() {
    definirId(null);
    definirNome("");
    definirDescricao("");
  }

  async function salvar(evento) {
    evento.preventDefault();
    const dados = { nome: nome, descricao: descricao || null };

    try {
      if (id) {
        await api.editar(id, dados);
      } else {
        await api.criar(dados);
      }

      limpar();
      await aoAtualizar(titulo + " atualizado com sucesso.");
    } catch (falha) {
      aoErro(falha.message);
    }
  }

  function iniciarEdicao(registro) {
    definirId(registro.id);
    definirNome(registro.nome);
    definirDescricao(registro.descricao || "");
  }

  async function alternarAtivo(registro) {
    try {
      await api.alterarAtivo(registro.id, !registro.ativo);
      await aoAtualizar(titulo + " atualizado com sucesso.");
    } catch (falha) {
      aoErro(falha.message);
    }
  }

  return (
    <section className="bloco-admin">
      <h3>{titulo}</h3>
      <form className="formulario-compacto" onSubmit={salvar}>
        <label>Nome<input value={nome} onChange={function atualizar(evento) { definirNome(evento.target.value); }} required /></label>
        <label>Descricao<input value={descricao} onChange={function atualizar(evento) { definirDescricao(evento.target.value); }} maxLength="500" /></label>
        <div className="acoes-formulario">
          <button type="submit">{id ? "Salvar edicao" : "Criar"}</button>
          {id && <button type="button" className="secundario" onClick={limpar}>Cancelar</button>}
        </div>
      </form>
      <ul className="lista-administrativa">
        {registros.map(function renderizar(registro) {
          return (
            <li key={registro.id} className={registro.ativo ? "" : "inativo"}>
              <span><strong>{registro.nome}</strong>{registro.ativo ? "" : " - inativo"}</span>
              <div>
                <button type="button" className="secundario" onClick={function editar() { iniciarEdicao(registro); }}>Editar</button>
                <button type="button" className="secundario" onClick={function alternar() { alternarAtivo(registro); }}>
                  {registro.ativo ? "Desativar" : "Ativar"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function PainelAcervo({ usuario, aoSair }) {
  const [estrutura, definirEstrutura] = useState({ categorias: [], disciplinas: [], concursos: [] });
  const [categorias, definirCategorias] = useState([]);
  const [disciplinas, definirDisciplinas] = useState([]);
  const [concursos, definirConcursos] = useState([]);
  const [usuarios, definirUsuarios] = useState([]);
  const [permissoes, definirPermissoes] = useState([]);
  const [minhasPermissoes, definirMinhasPermissoes] = useState([]);
  const [categoriaEmEdicao, definirCategoriaEmEdicao] = useState(null);
  const [nomeCategoria, definirNomeCategoria] = useState("");
  const [descricaoCategoria, definirDescricaoCategoria] = useState("");
  const [categoriaPaiId, definirCategoriaPaiId] = useState("");
  const [ordemCategoria, definirOrdemCategoria] = useState("0");
  const [professorId, definirProfessorId] = useState("");
  const [categoriaPermitidaId, definirCategoriaPermitidaId] = useState("");
  const [mensagem, definirMensagem] = useState("");
  const [erro, definirErro] = useState("");
  const [carregando, definirCarregando] = useState(true);

  async function carregar(mensagemInformada) {
    definirErro("");
    try {
      const publica = await listarEstruturaPublica();
      definirEstrutura(publica.estrutura);

      if (usuario.papel === "admin") {
        const resultados = await Promise.all([
          apiCategorias.listar(),
          apiDisciplinas.listar(),
          apiConcursos.listar(),
          listarUsuarios(),
          listarPermissoes()
        ]);
        definirCategorias(resultados[0].categorias);
        definirDisciplinas(resultados[1].disciplinas);
        definirConcursos(resultados[2].concursos);
        definirUsuarios(resultados[3].usuarios);
        definirPermissoes(resultados[4].permissoes);
      } else if (usuario.papel === "professor") {
        const proprias = await listarMinhasPermissoes();
        definirMinhasPermissoes(proprias.permissoes);
      }

      definirMensagem(mensagemInformada || "");
    } catch (falha) {
      definirErro(falha.message);
    } finally {
      definirCarregando(false);
    }
  }

  useEffect(function carregarAoEntrar() {
    carregar();
  }, [usuario.id]);

  function limparCategoria() {
    definirCategoriaEmEdicao(null);
    definirNomeCategoria("");
    definirDescricaoCategoria("");
    definirCategoriaPaiId("");
    definirOrdemCategoria("0");
  }

  function iniciarEdicaoCategoria(categoria) {
    definirCategoriaEmEdicao(categoria.id);
    definirNomeCategoria(categoria.nome);
    definirDescricaoCategoria(categoria.descricao || "");
    definirCategoriaPaiId(categoria.categoriaPaiId || "");
    definirOrdemCategoria(String(categoria.ordem));
  }

  async function salvarCategoria(evento) {
    evento.preventDefault();
    const dados = {
      nome: nomeCategoria,
      descricao: descricaoCategoria || null,
      categoriaPaiId: categoriaPaiId ? Number(categoriaPaiId) : null,
      ordem: Number(ordemCategoria)
    };

    try {
      if (categoriaEmEdicao) {
        await apiCategorias.editar(categoriaEmEdicao, dados);
      } else {
        await apiCategorias.criar(dados);
      }
      limparCategoria();
      await carregar("Categoria atualizada com sucesso.");
    } catch (falha) {
      definirErro(falha.message);
    }
  }

  async function alternarCategoria(categoria) {
    try {
      await apiCategorias.alterarAtivo(categoria.id, !categoria.ativo);
      await carregar("Estado da categoria atualizado.");
    } catch (falha) {
      definirErro(falha.message);
    }
  }

  async function conceder(evento) {
    evento.preventDefault();
    try {
      await concederPermissao(Number(professorId), Number(categoriaPermitidaId));
      definirProfessorId("");
      definirCategoriaPermitidaId("");
      await carregar("Permissao concedida.");
    } catch (falha) {
      definirErro(falha.message);
    }
  }

  async function revogar(permissaoId) {
    try {
      await revogarPermissao(permissaoId);
      await carregar("Permissao revogada.");
    } catch (falha) {
      definirErro(falha.message);
    }
  }

  const professores = usuarios.filter(function filtrarProfessor(item) {
    return item.papel === "professor" && item.ativo;
  });
  const categoriasAtivas = categorias.filter(function filtrarCategoria(item) {
    return item.ativo;
  });

  if (carregando) {
    return <main className="pagina-painel"><p>Carregando estrutura do acervo...</p></main>;
  }

  return (
    <main className="pagina-painel">
      <header className="cabecalho-painel">
        <div><span className="marca">Plantel Listas</span><h1>Estrutura do acervo</h1></div>
        <div className="usuario-painel"><span>{usuario.email} - {usuario.papel}</span><button type="button" onClick={aoSair}>Sair</button></div>
      </header>
      {mensagem && <p className="aviso sucesso" role="status">{mensagem}</p>}
      {erro && <p className="aviso erro" role="alert">{erro}</p>}

      <section className="grade-publica">
        <article className="cartao-painel"><h2>Categorias ativas</h2><ListaDeCategorias categorias={estrutura.categorias} /></article>
        <article className="cartao-painel"><h2>Disciplinas</h2><p>{estrutura.disciplinas.map(function obter(item) { return item.nome; }).join(", ") || "Nenhuma ativa."}</p></article>
        <article className="cartao-painel"><h2>Concursos</h2><p>{estrutura.concursos.map(function obter(item) { return item.nome; }).join(", ") || "Nenhum ativo."}</p></article>
      </section>

      {usuario.papel === "professor" && (
        <section className="cartao-painel"><h2>Minhas areas autorizadas</h2>
          <ul className="lista-simples">{minhasPermissoes.map(function renderizar(item) { return <li key={item.id}>{item.categoria.nome}</li>; })}</ul>
          {!minhasPermissoes.length && <p>Nenhuma area autorizada.</p>}
        </section>
      )}

      {usuario.papel === "admin" && (
        <section className="area-administrativa">
          <h2>Administracao estrutural</h2>
          <section className="bloco-admin">
            <h3>Categorias</h3>
            <form className="formulario-compacto" onSubmit={salvarCategoria}>
              <label>Nome<input value={nomeCategoria} onChange={function atualizar(evento) { definirNomeCategoria(evento.target.value); }} required /></label>
              <label>Descricao<input value={descricaoCategoria} onChange={function atualizar(evento) { definirDescricaoCategoria(evento.target.value); }} maxLength="500" /></label>
              <label>Categoria pai<select value={categoriaPaiId} onChange={function atualizar(evento) { definirCategoriaPaiId(evento.target.value); }}><option value="">Raiz</option>{categoriasAtivas.filter(function removerAtual(item) { return item.id !== categoriaEmEdicao; }).map(function opcao(item) { return <option key={item.id} value={item.id}>{item.nome}</option>; })}</select></label>
              <label>Ordem<input type="number" min="0" max="100000" value={ordemCategoria} onChange={function atualizar(evento) { definirOrdemCategoria(evento.target.value); }} required /></label>
              <div className="acoes-formulario"><button type="submit">{categoriaEmEdicao ? "Salvar edicao" : "Criar"}</button>{categoriaEmEdicao && <button type="button" className="secundario" onClick={limparCategoria}>Cancelar</button>}</div>
            </form>
            <ul className="lista-administrativa">{categorias.map(function renderizar(categoria) { return <li key={categoria.id} className={categoria.ativo ? "" : "inativo"}><span><strong>{categoria.nome}</strong>{categoria.ativo ? "" : " - inativa"}</span><div><button type="button" className="secundario" onClick={function editar() { iniciarEdicaoCategoria(categoria); }}>Editar</button><button type="button" className="secundario" onClick={function alternar() { alternarCategoria(categoria); }}>{categoria.ativo ? "Desativar" : "Ativar"}</button></div></li>; })}</ul>
          </section>
          <div className="grade-admin">
            <FormularioCatalogo titulo="Disciplinas" registros={disciplinas} api={apiDisciplinas} aoAtualizar={carregar} aoErro={definirErro} />
            <FormularioCatalogo titulo="Concursos" registros={concursos} api={apiConcursos} aoAtualizar={carregar} aoErro={definirErro} />
          </div>
          <section className="bloco-admin">
            <h3>Permissoes de professor</h3>
            <form className="formulario-compacto" onSubmit={conceder}>
              <label>Professor<select value={professorId} onChange={function atualizar(evento) { definirProfessorId(evento.target.value); }} required><option value="">Selecione</option>{professores.map(function opcao(item) { return <option key={item.id} value={item.id}>{item.email}</option>; })}</select></label>
              <label>Categoria<select value={categoriaPermitidaId} onChange={function atualizar(evento) { definirCategoriaPermitidaId(evento.target.value); }} required><option value="">Selecione</option>{categoriasAtivas.map(function opcao(item) { return <option key={item.id} value={item.id}>{item.nome}</option>; })}</select></label>
              <button type="submit">Conceder permissao</button>
            </form>
            <ul className="lista-administrativa">{permissoes.map(function renderizar(item) { return <li key={item.id} className={item.ativa ? "" : "inativo"}><span>{item.professor.email} - {item.categoria.nome}{item.ativa ? "" : " - revogada"}</span>{item.ativa && <button type="button" className="secundario" onClick={function executar() { revogar(item.id); }}>Revogar</button>}</li>; })}</ul>
          </section>
        </section>
      )}
    </main>
  );
}

export default PainelAcervo;
