import React, { useEffect, useState } from "react";
import {
  listarEstruturaPublica,
  listarUsuarios,
  categorias as apiCategorias,
  disciplinas as apiDisciplinas,
  concursos as apiConcursos,
  listarPermissoes,
  listarMinhasPermissoes,
  salvarAcessosProfessor,
  obterStatusGoogleDrive,
  iniciarOAuthGoogleDrive,
  sincronizarGoogleDrive,
  obterStatusDasAtualizacoesGoogleDrive
} from "./api.js";
import BibliotecaAcervo from "./BibliotecaAcervo.jsx";
import AdministracaoFase7 from "./AdministracaoFase7.jsx";
import { Alerta, AlternadorTema, Carregando, Icone, Vazio, mensagemHumana } from "./ComponentesInterface.jsx";
import { criarUrlDaNavegacao, obterAreaInicial, obterAreaPermitida, obterPastaDaUrl } from "./navegacao.js";

function obterTipoDeUsuario(papel) {
  const tipos = { admin: "Administrador", professor: "Professor", aluno: "Aluno" };
  return tipos[papel] || "Usuário";
}

function obterAmbienteDoUsuario(papel) {
  const ambientes = {
    admin: "Gestão dos materiais",
    professor: "Área do professor",
    aluno: "Biblioteca do aluno"
  };
  return ambientes[papel] || "Materiais de estudo";
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
  return mensagemHumana((mensagem || "Não foi possível concluir a ação.")
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
    .replace(/permissao/gi, "acesso"));
}

function ItemMenu({ area, atual, icone, texto, aoAbrir }) {
  return <button type="button" className={area === atual ? "ativo" : ""} aria-current={area === atual ? "page" : undefined} onClick={function abrir() { aoAbrir(area); }}><Icone nome={icone} /><span>{texto}</span></button>;
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
        <div><h3>{titulo}</h3><p>Organize as opções que aparecem na biblioteca.</p></div>
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
  const areaInicial = obterAreaInicial(usuario.papel);
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
  const [acompanhamentoDrive, definirAcompanhamentoDrive] = useState(null);
  const [processandoGoogleDrive, definirProcessandoGoogleDrive] = useState(false);
  const [mensagem, definirMensagem] = useState("");
  const [erro, definirErro] = useState("");
  const [carregando, definirCarregando] = useState(true);
  const [areaAtual, definirAreaAtual] = useState(function lerAreaInicialDaUrl() {
    return obterAreaPermitida(usuario.papel, window.location.search);
  });
  const [menuAberto, definirMenuAberto] = useState(false);
  const [buscaPastasAdmin, definirBuscaPastasAdmin] = useState("");
  const [paginaPastasAdmin, definirPaginaPastasAdmin] = useState(1);

  function mostrarErro(mensagem) {
    definirErro(traduzirErroDaApi(mensagem));
  }

  function aplicarArea(area) {
    definirAreaAtual(area);
    definirMenuAberto(false);
    definirMensagem("");
    definirErro("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function navegar(area) {
    if (area === areaAtual && !new URLSearchParams(window.location.search).has("pasta")) {
      definirMenuAberto(false);
      return;
    }
    window.history.pushState(
      { plantelListas: true, navegacaoInterna: true, tipo: "area", area: area },
      "",
      criarUrlDaNavegacao(window.location.pathname, area)
    );
    aplicarArea(area);
  }

  function voltarNaNavegacao() {
    if (window.history.state && window.history.state.navegacaoInterna && window.history.length > 1) {
      window.history.back();
      return;
    }
    navegar(areaInicial);
  }

  async function carregar(mensagemInformada) {
    definirErro("");
    try {
      const publica = await listarEstruturaPublica();
      definirEstrutura(publica.estrutura);

      if (usuario.papel === "admin") {
        const resultados = await Promise.all([
          apiCategorias.listar(), apiDisciplinas.listar(), apiConcursos.listar(),
          listarUsuarios({ papel: "professor", ativo: true, limite: 100 }), listarPermissoes(), obterStatusGoogleDrive(),
          obterStatusDasAtualizacoesGoogleDrive()
        ]);
        definirCategorias(resultados[0].categorias);
        definirDisciplinas(resultados[1].disciplinas);
        definirConcursos(resultados[2].concursos);
        definirUsuarios(resultados[3].usuarios);
        definirPermissoes(resultados[4].permissoes);
        definirGoogleDrive(resultados[5].googleDrive);
        definirAcompanhamentoDrive(resultados[6].acompanhamento);
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

  useEffect(function prepararHistoricoDaNavegacao() {
    const areaPermitida = obterAreaPermitida(usuario.papel, window.location.search);
    const pasta = areaPermitida === "acervo" ? obterPastaDaUrl(window.location.search) : null;
    window.history.replaceState(
      { plantelListas: true, tipo: pasta ? "pasta" : "area", area: areaPermitida },
      "",
      criarUrlDaNavegacao(window.location.pathname, areaPermitida, pasta)
    );
    definirAreaAtual(areaPermitida);

    function acompanharVoltarDoNavegador() {
      aplicarArea(obterAreaPermitida(usuario.papel, window.location.search));
    }

    window.addEventListener("popstate", acompanharVoltarDoNavegador);
    return function removerAcompanhamento() {
      window.removeEventListener("popstate", acompanharVoltarDoNavegador);
    };
  }, [usuario.id, usuario.papel]);

  useEffect(function permitirFecharMenuComEscape() {
    if (!menuAberto) return undefined;
    function fecharComEscape(evento) {
      if (evento.key === "Escape") definirMenuAberto(false);
    }
    document.addEventListener("keydown", fecharComEscape);
    return function removerAtalho() {
      document.removeEventListener("keydown", fecharComEscape);
    };
  }, [menuAberto]);

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
          carregar("Materiais sincronizados com o Google Drive.");
        } else if (novoStatus && novoStatus.status === "falhou") {
          if (resultado.googleDrive.renovacaoNecessaria) {
            definirErro("A conexão com o Google Drive precisa ser renovada.");
          } else {
            definirErro("Não foi possível concluir a sincronização dos materiais.");
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
    try {
      await salvarAcessosProfessor(professorIdNumerico, pastasSelecionadas);
      await carregar("Acessos do professor salvos com sucesso.");
    } catch (falha) {
      mostrarErro(falha.message);
    }
  }

  async function conectarGoogleDrive() {
    const janelaOAuth = window.open(
      "",
      "plantel-google-drive-oauth",
      "popup=yes,width=620,height=760,resizable=yes,scrollbars=yes"
    );
    if (!janelaOAuth) {
      definirErro("Permita a abertura da janela de conexão para continuar com o Google Drive.");
      return;
    }
    definirProcessandoGoogleDrive(true);
    definirErro("");
    const acompanhamentoDaJanela = window.setInterval(function acompanharFechamento() {
      if (janelaOAuth.closed) {
        window.clearInterval(acompanhamentoDaJanela);
        definirProcessandoGoogleDrive(false);
      }
    }, 500);
    try {
      const resultado = await iniciarOAuthGoogleDrive();
      janelaOAuth.location.replace(resultado.urlAutorizacao);
      janelaOAuth.focus();
    } catch (falha) {
      window.clearInterval(acompanhamentoDaJanela);
      janelaOAuth.close();
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
  const termoPastasAdmin = buscaPastasAdmin.trim().toLocaleLowerCase("pt-BR");
  const categoriasFiltradasAdmin = termoPastasAdmin
    ? categorias.filter(function localizarCategoria(item) {
      return item.nome.toLocaleLowerCase("pt-BR").includes(termoPastasAdmin);
    })
    : categorias;
  const limitePastasAdmin = 60;
  const totalPaginasPastasAdmin = Math.max(1, Math.ceil(categoriasFiltradasAdmin.length / limitePastasAdmin));
  const paginaPastasAdminSegura = Math.min(paginaPastasAdmin, totalPaginasPastasAdmin);
  const categoriasDaPaginaAdmin = categoriasFiltradasAdmin.slice(
    (paginaPastasAdminSegura - 1) * limitePastasAdmin,
    paginaPastasAdminSegura * limitePastasAdmin
  );
  const sincronizacaoEmAndamento = Boolean(
    googleDrive
    && googleDrive.ultimaSincronizacao
    && ["aguardando", "sincronizando"].includes(
      googleDrive.ultimaSincronizacao.status
    )
  );

  const informacoesDasAreas = {
    acervo: { codigo: "PL / 01", contexto: "Biblioteca digital", titulo: "Materiais de estudo", texto: "Encontre pastas, PDFs e vídeos com facilidade." },
    minhasPastas: { codigo: "PL / 02", contexto: "Área do professor", titulo: "Pastas que você gerencia", texto: "Veja onde você pode adicionar e organizar materiais." },
    usuarios: { codigo: "PL / 03", contexto: "Administração", titulo: "Usuários", texto: "Cuide das contas e dos tipos de acesso." },
    acessos: { codigo: "PL / 04", contexto: "Administração", titulo: "Acessos dos professores", texto: "Escolha quais pastas cada professor pode gerenciar." },
    organizacao: { codigo: "PL / 05", contexto: "Estrutura dos materiais", titulo: "Organização dos materiais", texto: "Mantenha pastas, disciplinas e concursos fáceis de encontrar." },
    estatisticas: { codigo: "PL / 00", contexto: "Painel administrativo", titulo: "Visão geral", texto: "Acompanhe os números e a atividade do Plantel Listas." },
    historico: { codigo: "PL / 06", contexto: "Auditoria", titulo: "Histórico de atividades", texto: "Consulte as ações importantes realizadas no sistema." },
    drive: { codigo: "PL / 07", contexto: "Integração", titulo: "Google Drive", texto: "Confira a conexão e mantenha os materiais atualizados." }
  };
  const informacaoDaArea = informacoesDasAreas[areaAtual] || informacoesDasAreas.acervo;

  if (carregando) {
    return <main className="pagina-painel carregamento-inicial"><Carregando texto="Preparando seus materiais..." /></main>;
  }

  return (
    <main className="pagina-painel">
      <button type="button" className="fundo-menu-mobile" aria-label="Fechar menu" tabIndex={menuAberto ? 0 : -1} onClick={function fecharMenu() { definirMenuAberto(false); }} />
      <aside className={menuAberto ? "barra-lateral aberta" : "barra-lateral"} aria-label="Menu principal">
        <div className="marca-painel"><span className="simbolo-marca">PL</span><span><strong>Plantel Listas</strong><small>Materiais de estudo</small></span><button type="button" className="botao-icone fechar-menu" aria-label="Fechar menu" onClick={function fechar() { definirMenuAberto(false); }}><Icone nome="fechar" /></button></div>
        <div className={"perfil-lateral " + usuario.papel}><span className="icone-perfil"><Icone nome={usuario.papel === "aluno" ? "acervo" : usuario.papel === "professor" ? "pasta" : "usuarios"} /></span><span><small>Ambiente atual</small><strong>{obterAmbienteDoUsuario(usuario.papel)}</strong></span></div>
        <nav className="menu-principal">
          <span className="rotulo-menu">Navegação</span>
          {usuario.papel === "admin" && <ItemMenu area="estatisticas" atual={areaAtual} icone="estatisticas" texto="Visão geral" aoAbrir={navegar} />}
          <ItemMenu area="acervo" atual={areaAtual} icone="acervo" texto="Biblioteca" aoAbrir={navegar} />
          {usuario.papel === "professor" && <ItemMenu area="minhasPastas" atual={areaAtual} icone="pasta" texto="Pastas liberadas" aoAbrir={navegar} />}
          {usuario.papel === "admin" && <><span className="rotulo-menu espacada">Administração</span><ItemMenu area="usuarios" atual={areaAtual} icone="usuarios" texto="Usuários" aoAbrir={navegar} /><ItemMenu area="acessos" atual={areaAtual} icone="acessos" texto="Acessos" aoAbrir={navegar} /><ItemMenu area="organizacao" atual={areaAtual} icone="organizacao" texto="Organização" aoAbrir={navegar} /><ItemMenu area="historico" atual={areaAtual} icone="historico" texto="Histórico" aoAbrir={navegar} /><ItemMenu area="drive" atual={areaAtual} icone="drive" texto="Google Drive" aoAbrir={navegar} /></>}
        </nav>
        <div className="conta-lateral"><span className="avatar-usuario">{usuario.email.slice(0, 1).toUpperCase()}</span><span><strong>{usuario.email}</strong><small>{obterTipoDeUsuario(usuario.papel)}</small></span><button type="button" className="botao-icone" aria-label="Sair" onClick={aoSair}><Icone nome="sair" /></button></div>
      </aside>

      <section className={"conteudo-aplicacao area-" + areaAtual}>
        <header className="cabecalho-mobile"><button type="button" className="botao-icone" aria-label="Abrir menu" onClick={function abrirMenu() { definirMenuAberto(true); }}><Icone nome="menu" /></button><div className="marca-mobile-painel"><span className="simbolo-marca pequeno">PL</span><strong>Plantel Listas</strong></div><AlternadorTema compacto /></header>
        <header className="cabecalho-painel">
          <div className="identidade-cabecalho"><i aria-hidden="true" /><div><small>Área atual</small><h1>{informacaoDaArea.titulo}</h1></div></div>
          <div className="controles-cabecalho"><time className="data-cabecalho" dateTime={new Date().toISOString().slice(0, 10)}>{new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(new Date())}</time><AlternadorTema /></div>
        </header>
        {areaAtual !== areaInicial && <button type="button" className="botao-voltar-navegacao voltar-area" onClick={voltarNaNavegacao}><Icone nome="voltar" tamanho={18} />Voltar</button>}
        <section className="introducao-area"><div className="texto-introducao"><span>{informacaoDaArea.contexto}</span><h2>{informacaoDaArea.titulo}</h2><p>{informacaoDaArea.texto}</p></div><span className="codigo-area" aria-hidden="true">{informacaoDaArea.codigo}</span></section>
        <div className="avisos-globais">{mensagem && <Alerta tipo="sucesso">{mensagem}</Alerta>}{erro && <Alerta tipo="erro">{erro}</Alerta>}</div>

        {areaAtual === "acervo" && <BibliotecaAcervo usuario={usuario} aoMensagem={definirMensagem} />}

        {usuario.papel === "professor" && areaAtual === "minhasPastas" && <section className="cartao-painel painel-conteudo"><div className="cabecalho-bloco"><div><h2>Pastas liberadas para você</h2><p>Você pode adicionar, editar e mover materiais somente nestas pastas.</p></div></div><ul className="lista-pastas-professor">{minhasPermissoes.map(function renderizar(item) { return <li key={item.id}><span className="icone-lista"><Icone nome="pasta" /></span><span><strong>{item.categoria.nome}</strong><small>Você pode gerenciar os materiais desta pasta.</small></span></li>; })}</ul>{!minhasPermissoes.length && <Vazio titulo="Nenhuma pasta liberada" texto="Quando um administrador liberar uma pasta, ela aparecerá aqui." />}</section>}

        {usuario.papel === "admin" && ["usuarios", "estatisticas", "historico"].includes(areaAtual) && <AdministracaoFase7 usuario={usuario} area={areaAtual} aoMensagem={definirMensagem} aoErro={mostrarErro} />}

        {usuario.papel === "admin" && areaAtual === "drive" && <section className="bloco-admin integracao-drive painel-conteudo">
            <div className="cabecalho-bloco">
              <div>
                <span className="icone-destaque"><Icone nome="drive" tamanho={26} /></span>
                <h2>Conexão com o Google Drive</h2>
                <p>O Drive guarda os arquivos. Use esta área para conferir e atualizar os materiais.</p>
              </div>
              {googleDrive && googleDrive.conectado ? (
                <button type="button" onClick={sincronizarAcervo} disabled={processandoGoogleDrive || sincronizacaoEmAndamento}>
                  {processandoGoogleDrive || sincronizacaoEmAndamento ? "Atualizando materiais..." : "Atualizar materiais agora"}
                </button>
              ) : (
                <button type="button" onClick={conectarGoogleDrive} disabled={processandoGoogleDrive || !googleDrive || !googleDrive.configurado}>
                  {processandoGoogleDrive
                    ? "Conectando..."
                    : googleDrive && googleDrive.renovacaoNecessaria
                      ? "Renovar conexão"
                      : "Conectar conta do Google Drive"}
                </button>
              )}
            </div>
            {googleDrive && googleDrive.conectado && <p className="estado-integracao conectado"><Icone nome="sucesso" /> Conta do Google Drive conectada.</p>}
            {googleDrive && googleDrive.renovacaoNecessaria && <p className="estado-integracao pendente"><Icone nome="alerta" /> A conexão precisa ser renovada para continuar atualizando os materiais.</p>}
            {googleDrive && !googleDrive.configurado && <p className="estado-integracao pendente">A conexão ainda precisa ser configurada pelo responsável técnico.</p>}
            {googleDrive && googleDrive.configurado && !googleDrive.conectado && !googleDrive.renovacaoNecessaria && <p className="estado-integracao pendente">Conecte a conta do Google Drive antes da primeira sincronização.</p>}
            {googleDrive && googleDrive.ultimaSincronizacao && (
              <p className="resumo-sincronizacao">
                Última atualização: {obterTextoDaSincronizacao(googleDrive.ultimaSincronizacao)} · {googleDrive.ultimaSincronizacao.arquivosEncontrados} arquivos encontrados.
              </p>
            )}
            {acompanhamentoDrive && (
              <p className="resumo-sincronizacao">
                Atualizações automáticas: {acompanhamentoDrive.acompanhamentoAtivo ? "funcionando" : "sendo preparadas"}.
                {acompanhamentoDrive.reconciliacaoNecessaria && " Uma conferência completa será feita em seguida."}
              </p>
            )}
          </section>}

        {usuario.papel === "admin" && areaAtual === "organizacao" && <><section className="bloco-admin painel-conteudo area-organizacao">
            <div className="cabecalho-bloco">
              <div><h2>Pastas</h2><p>Organize os materiais em pastas e subpastas.</p></div>
              {!formularioPastaAberto && <button type="button" className="botao-principal" onClick={iniciarCriacaoCategoria}><Icone nome="mais" />Nova pasta</button>}
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
            <div className="ferramentas-lista-organizacao">
              <label><span>Localizar pasta</span><span className="campo-com-icone"><Icone nome="buscar" /><input type="search" value={buscaPastasAdmin} placeholder="Digite o nome da pasta" onChange={function buscarPasta(evento) { definirBuscaPastasAdmin(evento.target.value); definirPaginaPastasAdmin(1); }} /></span></label>
              <span>{categoriasFiltradasAdmin.length.toLocaleString("pt-BR")} {categoriasFiltradasAdmin.length === 1 ? "pasta" : "pastas"}</span>
            </div>
            <ul className="lista-administrativa">
              {categoriasDaPaginaAdmin.map(function renderizar(categoria) {
                const pastaPai = categorias.find(function encontrar(item) { return item.id === categoria.categoriaPaiId; });
                return (
                  <li key={categoria.id} className={categoria.ativo ? "" : "inativo"}>
                    <span className="identidade-pasta-admin"><span className="icone-pasta-admin"><Icone nome="pasta" tamanho={18} /></span><span><strong>{categoria.nome}</strong><small>{pastaPai ? "Dentro de " + pastaPai.nome : "Pasta principal"}</small>{!categoria.ativo && <small className="estado-item">Oculta para os usuários</small>}</span></span>
                    <div><button type="button" className="secundario" onClick={function editar() { iniciarEdicaoCategoria(categoria); }}>Editar</button><button type="button" className="secundario" onClick={function alternar() { alternarCategoria(categoria); }}>{categoria.ativo ? "Ocultar" : "Mostrar"}</button></div>
                  </li>
                );
              })}
            </ul>
            {!categoriasFiltradasAdmin.length && <p className="estado-vazio">Nenhuma pasta encontrada.</p>}
            {totalPaginasPastasAdmin > 1 && <nav className="paginacao paginacao-organizacao" aria-label="Páginas das pastas"><button type="button" className="secundario" disabled={paginaPastasAdminSegura <= 1} onClick={function anterior() { definirPaginaPastasAdmin(paginaPastasAdminSegura - 1); }}>Anterior</button><span>Página <strong>{paginaPastasAdminSegura}</strong> de {totalPaginasPastasAdmin}</span><button type="button" className="secundario" disabled={paginaPastasAdminSegura >= totalPaginasPastasAdmin} onClick={function proxima() { definirPaginaPastasAdmin(paginaPastasAdminSegura + 1); }}>Próxima</button></nav>}
          </section>

          <div className="grade-admin">
            <FormularioCatalogo titulo="Disciplinas" singular="Disciplina" registros={disciplinas} api={apiDisciplinas} aoAtualizar={carregar} aoErro={mostrarErro} />
            <FormularioCatalogo titulo="Concursos" singular="Concurso" registros={concursos} api={apiConcursos} aoAtualizar={carregar} aoErro={mostrarErro} />
          </div></>}

        {usuario.papel === "admin" && areaAtual === "acessos" && <section className="bloco-admin painel-conteudo">
            <div className="cabecalho-bloco"><div><h2>Acessos dos professores</h2><p>Escolha um professor e marque as pastas que ele poderá gerenciar.</p></div></div>
            <form className="formulario-acessos" onSubmit={salvarAcessos}>
              <label>Professor<select value={professorId} onChange={selecionarProfessor} required><option value="">Selecione um professor</option>{professores.map(function opcao(item) { return <option key={item.id} value={item.id}>{item.email}</option>; })}</select></label>
              {professorId && (
                <fieldset>
                  <legend>Quais pastas este professor pode gerenciar?</legend>
                  <div className="lista-selecao">
                    {categoriasAtivas.map(function opcao(categoria) {
                      return <label key={categoria.id} className="opcao-pasta"><input type="checkbox" checked={pastasSelecionadas.includes(categoria.id)} onChange={function alternar() { alternarPastaSelecionada(categoria.id); }} /><span className="icone-opcao"><Icone nome="pasta" /></span><span>{categoria.nome}</span></label>;
                    })}
                  </div>
                  {!categoriasAtivas.length && <p className="estado-vazio">Crie e mostre uma pasta antes de liberar acessos.</p>}
                </fieldset>
              )}
              {professorId && <button type="submit">Salvar acessos</button>}
            </form>
            {!professores.length && <p className="estado-vazio">Nenhum professor ativo encontrado.</p>}
          </section>}
      </section>
    </main>
  );
}

export default PainelAcervo;
