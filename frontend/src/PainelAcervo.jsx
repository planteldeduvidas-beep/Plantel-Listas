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
  revogarPermissao,
  obterStatusGoogleDrive,
  iniciarOAuthGoogleDrive,
  sincronizarGoogleDrive
} from "./api.js";

function obterTipoDeUsuario(papel) {
  const tipos = { admin: "Administrador", professor: "Professor", aluno: "Aluno" };
  return tipos[papel] || "Usuário";
}

function obterTextoDaSincronizacao(sincronizacao) {
  if (sincronizacao.status === "aguardando") {
    return "aguardando início";
  }

  if (sincronizacao.status === "sincronizando") {
    return "em andamento";
  }

  if (sincronizacao.status === "concluida") {
    return "concluída";
  }

  return "não concluída";
}

function traduzirErroDaApi(mensagem) {
  return (mensagem || "Não foi possível concluir a ação.")
    .replace(/Movimentacao criaria ciclo na hierarquia/gi, "Esta pasta não pode ser colocada dentro de uma de suas subpastas")
    .replace(/Categoria nao pode ser pai de si mesma/gi, "Uma pasta não pode ser criada dentro dela mesma")
    .replace(/Categoria pai esta inativa/gi, "A pasta escolhida está oculta")
    .replace(/Categoria inativa nao pode ser editada/gi, "Mostre a pasta antes de editá-la")
    .replace(/Categoria nao encontrada/gi, "Pasta não encontrada")
    .replace(/Permissao ja concedida/gi, "Este professor já tem acesso a essa pasta")
    .replace(/Permissao nao encontrada/gi, "Acesso não encontrado")
    .replace(/Permissao ja revogada/gi, "Este acesso já foi removido")
    .replace(/Usuario sem permissao/gi, "Você não pode realizar esta ação")
    .replace(/categoria pai/gi, "pasta escolhida")
    .replace(/categorias/gi, "pastas")
    .replace(/categoria/gi, "pasta")
    .replace(/permissoes/gi, "acessos")
    .replace(/permissao/gi, "acesso");
}

function ListaDePastas({ categorias }) {
  if (!categorias.length) {
    return <p className="estado-vazio">Nenhuma pasta disponível no momento.</p>;
  }

  return (
    <ul className="arvore-categorias">
      {categorias.map(function renderizarPasta(categoria) {
        return (
          <li key={categoria.id}>
            <strong>{categoria.nome}</strong>
            {categoria.descricao && <span>{categoria.descricao}</span>}
            {categoria.filhas.length > 0 && <ListaDePastas categorias={categoria.filhas} />}
          </li>
        );
      })}
    </ul>
  );
}

function FormularioCatalogo({ titulo, singular, registros, api, aoAtualizar, aoErro }) {
  const [id, definirId] = useState(null);
  const [nome, definirNome] = useState("");
  const [descricao, definirDescricao] = useState("");
  const [formularioAberto, definirFormularioAberto] = useState(false);

  function limpar() {
    definirId(null);
    definirNome("");
    definirDescricao("");
    definirFormularioAberto(false);
  }

  function iniciarCriacao() {
    definirId(null);
    definirNome("");
    definirDescricao("");
    definirFormularioAberto(true);
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
      await aoAtualizar("Alterações salvas com sucesso.");
    } catch (falha) {
      aoErro(falha.message);
    }
  }

  function iniciarEdicao(registro) {
    definirId(registro.id);
    definirNome(registro.nome);
    definirDescricao(registro.descricao || "");
    definirFormularioAberto(true);
  }

  async function alternarVisibilidade(registro) {
    try {
      await api.alterarAtivo(registro.id, !registro.ativo);
      await aoAtualizar(registro.ativo ? "Item ocultado." : "Item mostrado novamente.");
    } catch (falha) {
      aoErro(falha.message);
    }
  }

  return (
    <section className="bloco-admin">
      <div className="cabecalho-bloco">
        <div><h3>{titulo}</h3><p>Organize as opções que aparecem no acervo.</p></div>
        {!formularioAberto && <button type="button" onClick={iniciarCriacao}>+ Adicionar {singular.toLowerCase()}</button>}
      </div>
      {formularioAberto && (
        <form className="formulario-edicao" onSubmit={salvar}>
          <h4>{id ? "Editar " + singular.toLowerCase() : "Adicionar " + singular.toLowerCase()}</h4>
          <label>Nome<input value={nome} onChange={function atualizar(evento) { definirNome(evento.target.value); }} required /></label>
          <label>Descrição (opcional)<input value={descricao} onChange={function atualizar(evento) { definirDescricao(evento.target.value); }} maxLength="500" /></label>
          <div className="acoes-formulario">
            <button type="submit">{id ? "Salvar alterações" : "Adicionar"}</button>
            <button type="button" className="secundario" onClick={limpar}>Cancelar</button>
          </div>
        </form>
      )}
      <ul className="lista-administrativa">
        {registros.map(function renderizar(registro) {
          return (
            <li key={registro.id} className={registro.ativo ? "" : "inativo"}>
              <span><strong>{registro.nome}</strong>{!registro.ativo && <small className="estado-item">Oculto para os usuários</small>}</span>
              <div>
                <button type="button" className="secundario" onClick={function editar() { iniciarEdicao(registro); }}>Editar</button>
                <button type="button" className="secundario" onClick={function alternar() { alternarVisibilidade(registro); }}>{registro.ativo ? "Ocultar" : "Mostrar"}</button>
              </div>
            </li>
          );
        })}
      </ul>
      {!registros.length && <p className="estado-vazio">Nenhum item adicionado ainda.</p>}
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
  const [formularioPastaAberto, definirFormularioPastaAberto] = useState(false);
  const [professorId, definirProfessorId] = useState("");
  const [pastasSelecionadas, definirPastasSelecionadas] = useState([]);
  const [googleDrive, definirGoogleDrive] = useState(null);
  const [processandoGoogleDrive, definirProcessandoGoogleDrive] = useState(false);
  const [mensagem, definirMensagem] = useState("");
  const [erro, definirErro] = useState("");
  const [carregando, definirCarregando] = useState(true);

  function mostrarErro(mensagem) {
    definirErro(traduzirErroDaApi(mensagem));
  }

  async function carregar(mensagemInformada) {
    definirErro("");
    try {
      const publica = await listarEstruturaPublica();
      definirEstrutura(publica.estrutura);

      if (usuario.papel === "admin") {
        const resultados = await Promise.all([
          apiCategorias.listar(), apiDisciplinas.listar(), apiConcursos.listar(),
          listarUsuarios(), listarPermissoes(), obterStatusGoogleDrive()
        ]);
        definirCategorias(resultados[0].categorias);
        definirDisciplinas(resultados[1].disciplinas);
        definirConcursos(resultados[2].concursos);
        definirUsuarios(resultados[3].usuarios);
        definirPermissoes(resultados[4].permissoes);
        definirGoogleDrive(resultados[5].googleDrive);
      } else if (usuario.papel === "professor") {
        const proprias = await listarMinhasPermissoes();
        definirMinhasPermissoes(proprias.permissoes);
      }

      definirMensagem(mensagemInformada || "");
    } catch (falha) {
      mostrarErro(falha.message);
    } finally {
      definirCarregando(false);
    }
  }

  useEffect(function carregarAoEntrar() {
    carregar();
  }, [usuario.id]);

  useEffect(function acompanharSincronizacao() {
    const ultimaSincronizacao = googleDrive && googleDrive.ultimaSincronizacao;
    const deveAcompanhar = usuario.papel === "admin"
      && ultimaSincronizacao
      && ["aguardando", "sincronizando"].includes(ultimaSincronizacao.status);

    if (!deveAcompanhar) {
      return undefined;
    }

    const intervalo = window.setInterval(function consultarStatus() {
      obterStatusGoogleDrive().then(function atualizar(resultado) {
        const novoStatus = resultado.googleDrive.ultimaSincronizacao;
        definirGoogleDrive(resultado.googleDrive);
        if (novoStatus && novoStatus.status === "concluida") {
          carregar("Acervo sincronizado com o Google Drive.");
        } else if (novoStatus && novoStatus.status === "falhou") {
          if (resultado.googleDrive.renovacaoNecessaria) {
            definirErro("A conexão com o Google Drive precisa ser renovada.");
          } else {
            definirErro("Não foi possível concluir a sincronização do acervo.");
          }
        }
      }).catch(function tratarFalha(falha) {
        mostrarErro(falha.message);
      });
    }, 3000);

    return function pararAcompanhamento() {
      window.clearInterval(intervalo);
    };
  }, [
    usuario.papel,
    googleDrive && googleDrive.ultimaSincronizacao
      ? googleDrive.ultimaSincronizacao.id
      : null,
    googleDrive && googleDrive.ultimaSincronizacao
      ? googleDrive.ultimaSincronizacao.status
      : null
  ]);

  function limparCategoria() {
    definirCategoriaEmEdicao(null);
    definirNomeCategoria("");
    definirDescricaoCategoria("");
    definirCategoriaPaiId("");
    definirOrdemCategoria("0");
    definirFormularioPastaAberto(false);
  }

  function iniciarCriacaoCategoria() {
    limparCategoria();
    definirFormularioPastaAberto(true);
  }

  function iniciarEdicaoCategoria(categoria) {
    definirCategoriaEmEdicao(categoria.id);
    definirNomeCategoria(categoria.nome);
    definirDescricaoCategoria(categoria.descricao || "");
    definirCategoriaPaiId(categoria.categoriaPaiId || "");
    definirOrdemCategoria(String(categoria.ordem));
    definirFormularioPastaAberto(true);
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
      await carregar("Pasta salva com sucesso.");
    } catch (falha) {
      mostrarErro(falha.message);
    }
  }

  async function alternarCategoria(categoria) {
    try {
      await apiCategorias.alterarAtivo(categoria.id, !categoria.ativo);
      await carregar(categoria.ativo ? "Pasta ocultada." : "Pasta mostrada novamente.");
    } catch (falha) {
      mostrarErro(falha.message);
    }
  }

  function selecionarProfessor(evento) {
    const novoProfessorId = evento.target.value;
    definirProfessorId(novoProfessorId);
    definirPastasSelecionadas(
      permissoes.filter(function filtrar(item) {
        return item.ativa && item.professor.id === Number(novoProfessorId);
      }).map(function obterPasta(item) {
        return item.categoria.id;
      })
    );
  }

  function alternarPastaSelecionada(categoriaId) {
    if (pastasSelecionadas.includes(categoriaId)) {
      definirPastasSelecionadas(pastasSelecionadas.filter(function remover(id) { return id !== categoriaId; }));
    } else {
      definirPastasSelecionadas(pastasSelecionadas.concat(categoriaId));
    }
  }

  async function salvarAcessos(evento) {
    evento.preventDefault();
    const professorIdNumerico = Number(professorId);
    const acessosAtuais = permissoes.filter(function filtrar(item) {
      return item.ativa && item.professor.id === professorIdNumerico;
    });
    const idsAtuais = acessosAtuais.map(function obterId(item) { return item.categoria.id; });
    const novosAcessos = pastasSelecionadas.filter(function filtrar(id) { return !idsAtuais.includes(id); });
    const acessosRemovidos = acessosAtuais.filter(function filtrar(item) { return !pastasSelecionadas.includes(item.categoria.id); });

    try {
      await Promise.all(
        novosAcessos.map(function liberar(categoriaId) {
          return concederPermissao(professorIdNumerico, categoriaId);
        }).concat(acessosRemovidos.map(function remover(item) {
          return revogarPermissao(item.id);
        }))
      );
      await carregar("Acessos do professor salvos com sucesso.");
    } catch (falha) {
      mostrarErro(falha.message);
    }
  }

  async function conectarGoogleDrive() {
    definirProcessandoGoogleDrive(true);
    definirErro("");
    try {
      const resultado = await iniciarOAuthGoogleDrive();
      window.location.assign(resultado.urlAutorizacao);
    } catch (falha) {
      mostrarErro(falha.message);
      definirProcessandoGoogleDrive(false);
    }
  }

  async function sincronizarAcervo() {
    definirProcessandoGoogleDrive(true);
    definirErro("");
    try {
      const resultado = await sincronizarGoogleDrive();
      definirGoogleDrive(Object.assign({}, googleDrive, {
        ultimaSincronizacao: resultado.sincronizacao
      }));
      definirMensagem("Sincronização iniciada. Você pode continuar usando o sistema.");
    } catch (falha) {
      mostrarErro(falha.message);
    } finally {
      definirProcessandoGoogleDrive(false);
    }
  }

  const professores = usuarios.filter(function filtrarProfessor(item) {
    return item.papel === "professor" && item.ativo;
  });
  const categoriasAtivas = categorias.filter(function filtrarCategoria(item) {
    return item.ativo;
  });
  const sincronizacaoEmAndamento = Boolean(
    googleDrive
    && googleDrive.ultimaSincronizacao
    && ["aguardando", "sincronizando"].includes(
      googleDrive.ultimaSincronizacao.status
    )
  );

  if (carregando) {
    return <main className="pagina-painel"><p>Preparando seu acervo...</p></main>;
  }

  return (
    <main className="pagina-painel">
      <header className="cabecalho-painel">
        <div><span className="marca">Plantel Listas</span><h1>Acervo de estudos</h1></div>
        <div className="usuario-painel">
          <span><strong>{usuario.email}</strong><small>{obterTipoDeUsuario(usuario.papel)}</small></span>
          <button type="button" className="secundario" onClick={aoSair}>Sair</button>
        </div>
      </header>
      {mensagem && <p className="aviso sucesso" role="status">{mensagem}</p>}
      {erro && <p className="aviso erro" role="alert">{erro}</p>}

      <section className="grade-publica">
        <article className="cartao-painel cartao-pastas"><h2>Pastas disponíveis</h2><ListaDePastas categorias={estrutura.categorias} /></article>
        <article className="cartao-painel"><h2>Disciplinas</h2><p>{estrutura.disciplinas.map(function obter(item) { return item.nome; }).join(", ") || "Nenhuma disciplina disponível."}</p></article>
        <article className="cartao-painel"><h2>Concursos</h2><p>{estrutura.concursos.map(function obter(item) { return item.nome; }).join(", ") || "Nenhum concurso disponível."}</p></article>
      </section>

      {usuario.papel === "professor" && (
        <section className="cartao-painel">
          <h2>Pastas que você pode gerenciar</h2>
          <p className="texto-apoio">Você pode organizar conteúdos somente nestas pastas.</p>
          <ul className="lista-simples">{minhasPermissoes.map(function renderizar(item) { return <li key={item.id}>{item.categoria.nome}</li>; })}</ul>
          {!minhasPermissoes.length && <p>Nenhuma pasta foi liberada para você ainda.</p>}
        </section>
      )}

      {usuario.papel === "admin" && (
        <section className="area-administrativa">
          <div className="introducao-admin"><h2>Organizar o acervo</h2><p>Crie as opções que alunos e professores usarão para encontrar os conteúdos.</p></div>

          <section className="bloco-admin integracao-drive">
            <div className="cabecalho-bloco">
              <div>
                <h3>Google Drive</h3>
                <p>Conecte e atualize as pastas e os arquivos do acervo.</p>
              </div>
              {googleDrive && googleDrive.conectado ? (
                <button type="button" onClick={sincronizarAcervo} disabled={processandoGoogleDrive || sincronizacaoEmAndamento}>
                  {processandoGoogleDrive || sincronizacaoEmAndamento ? "Sincronizando..." : "Sincronizar agora"}
                </button>
              ) : (
                <button type="button" onClick={conectarGoogleDrive} disabled={processandoGoogleDrive || !googleDrive || !googleDrive.configurado}>
                  {processandoGoogleDrive
                    ? "Conectando..."
                    : googleDrive && googleDrive.renovacaoNecessaria
                      ? "Reconectar Google Drive"
                      : "Conectar Google Drive"}
                </button>
              )}
            </div>
            {googleDrive && googleDrive.conectado && <p className="estado-integracao conectado">Google Drive conectado.</p>}
            {googleDrive && googleDrive.renovacaoNecessaria && <p className="estado-integracao pendente">A conexão com o Google Drive precisa ser renovada. Reconecte a conta do acervo.</p>}
            {googleDrive && !googleDrive.configurado && <p className="estado-integracao pendente">A conexão ainda precisa ser configurada pelo responsável técnico.</p>}
            {googleDrive && googleDrive.configurado && !googleDrive.conectado && !googleDrive.renovacaoNecessaria && <p className="estado-integracao pendente">Conecte a conta do acervo antes da primeira sincronização.</p>}
            {googleDrive && googleDrive.ultimaSincronizacao && (
              <p className="resumo-sincronizacao">
                Última sincronização: {obterTextoDaSincronizacao(googleDrive.ultimaSincronizacao)}. {googleDrive.ultimaSincronizacao.arquivosEncontrados} arquivos encontrados.
              </p>
            )}
          </section>

          <section className="bloco-admin">
            <div className="cabecalho-bloco">
              <div><h3>Pastas</h3><p>Organize o acervo em pastas e subpastas.</p></div>
              {!formularioPastaAberto && <button type="button" onClick={iniciarCriacaoCategoria}>+ Nova pasta</button>}
            </div>
            {formularioPastaAberto && (
              <form className="formulario-edicao" onSubmit={salvarCategoria}>
                <h4>{categoriaEmEdicao ? "Editar pasta" : "Nova pasta"}</h4>
                <label>Nome da pasta<input value={nomeCategoria} onChange={function atualizar(evento) { definirNomeCategoria(evento.target.value); }} required /></label>
                <label>Descrição (opcional)<input value={descricaoCategoria} onChange={function atualizar(evento) { definirDescricaoCategoria(evento.target.value); }} maxLength="500" /></label>
                <label>Criar dentro de<select value={categoriaPaiId} onChange={function atualizar(evento) { definirCategoriaPaiId(evento.target.value); }}><option value="">Nenhuma pasta (nível principal)</option>{categoriasAtivas.filter(function removerAtual(item) { return item.id !== categoriaEmEdicao; }).map(function opcao(item) { return <option key={item.id} value={item.id}>{item.nome}</option>; })}</select></label>
                <div className="acoes-formulario"><button type="submit">{categoriaEmEdicao ? "Salvar alterações" : "Criar pasta"}</button><button type="button" className="secundario" onClick={limparCategoria}>Cancelar</button></div>
              </form>
            )}
            <ul className="lista-administrativa">
              {categorias.map(function renderizar(categoria) {
                const pastaPai = categorias.find(function encontrar(item) { return item.id === categoria.categoriaPaiId; });
                return (
                  <li key={categoria.id} className={categoria.ativo ? "" : "inativo"}>
                    <span><strong>{categoria.nome}</strong><small>{pastaPai ? "Dentro de " + pastaPai.nome : "Pasta principal"}</small>{!categoria.ativo && <small className="estado-item">Oculta para os usuários</small>}</span>
                    <div><button type="button" className="secundario" onClick={function editar() { iniciarEdicaoCategoria(categoria); }}>Editar</button><button type="button" className="secundario" onClick={function alternar() { alternarCategoria(categoria); }}>{categoria.ativo ? "Ocultar" : "Mostrar"}</button></div>
                  </li>
                );
              })}
            </ul>
            {!categorias.length && <p className="estado-vazio">Nenhuma pasta criada ainda.</p>}
          </section>

          <div className="grade-admin">
            <FormularioCatalogo titulo="Disciplinas" singular="Disciplina" registros={disciplinas} api={apiDisciplinas} aoAtualizar={carregar} aoErro={mostrarErro} />
            <FormularioCatalogo titulo="Concursos" singular="Concurso" registros={concursos} api={apiConcursos} aoAtualizar={carregar} aoErro={mostrarErro} />
          </div>

          <section className="bloco-admin">
            <div className="cabecalho-bloco"><div><h3>Acesso dos professores</h3><p>Escolha um professor e marque as pastas que ele poderá gerenciar.</p></div></div>
            <form className="formulario-acessos" onSubmit={salvarAcessos}>
              <label>Professor<select value={professorId} onChange={selecionarProfessor} required><option value="">Selecione um professor</option>{professores.map(function opcao(item) { return <option key={item.id} value={item.id}>{item.email}</option>; })}</select></label>
              {professorId && (
                <fieldset>
                  <legend>Quais pastas este professor pode gerenciar?</legend>
                  <div className="lista-selecao">
                    {categoriasAtivas.map(function opcao(categoria) {
                      return <label key={categoria.id} className="opcao-pasta"><input type="checkbox" checked={pastasSelecionadas.includes(categoria.id)} onChange={function alternar() { alternarPastaSelecionada(categoria.id); }} /><span>{categoria.nome}</span></label>;
                    })}
                  </div>
                  {!categoriasAtivas.length && <p className="estado-vazio">Crie e mostre uma pasta antes de liberar acessos.</p>}
                </fieldset>
              )}
              {professorId && <button type="submit">Salvar acessos</button>}
            </form>
            {!professores.length && <p className="estado-vazio">Nenhum professor ativo encontrado.</p>}
          </section>
        </section>
      )}
    </main>
  );
}

export default PainelAcervo;
