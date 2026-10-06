import React, { useEffect, useRef, useState } from "react";
import MenuUsuario from "./MenuUsuario.jsx";
import CorrecaoFaixaEtariaAdmin from './CorrecaoFaixaEtariaAdmin.jsx';
import { createPortal } from "react-dom";
import GraficoBarras from "./GraficoBarras.jsx";
import GraficoComposicao from "./GraficoComposicao.jsx";
import "./analytics.css";
import {
  listarUsuarios, criarUsuario, editarUsuario, alterarPapelUsuario,
  alterarEstadoUsuario, iniciarRedefinicaoUsuario, obterAnalytics,
  obterAuditoria, obterUrlRelatorio
  , obterDetalhesUsuario, excluirUsuario, enviarVerificacaoUsuario, regularizarEmailUsuario
} from "./api.js";
import { CampoSenha, Esqueleto, Icone, Modal, Vazio, mensagemHumana } from "./ComponentesInterface.jsx";

function nomePapel(papel) {
  return { aluno: "Aluno", professor: "Professor", admin: "Administrador" }[papel] || "Usuário";
}

function CartaoNumero({ titulo, valor }) {
  return <article className="cartao-estatistica"><span>{titulo}</span><strong>{valor}</strong></article>;
}

function GraficoUso({ dados }) {
  if (!dados.length) return <Vazio titulo="Ainda não há atividade no período" texto="O gráfico aparecerá conforme os materiais forem utilizados." />;
  const maiorObservado = Math.max(1, ...dados.flatMap(function valores(item) {
    return [item.acessos, item.visualizacoes, item.downloads];
  }));
  const intervaloDaEscala = Math.max(1, Math.ceil(maiorObservado / 4));
  const limiteDaEscala = intervaloDaEscala * 4;
  const totais = dados.reduce(function somar(total, item) {
    return {
      acessos: total.acessos + item.acessos,
      visualizacoes: total.visualizacoes + item.visualizacoes,
      downloads: total.downloads + item.downloads
    };
  }, { acessos: 0, visualizacoes: 0, downloads: 0 });
  const marcas = [4, 3, 2, 1, 0].map(function marcar(parte) { return parte * intervaloDaEscala; });

  function altura(valor) {
    if (!valor) return "0px";
    return Math.round((valor / limiteDaEscala) * 100) + "%";
  }

  return (
    <div className="grafico-uso-completo">
      <div className="legenda-grafico">
        <span><i className="legenda-acessos" /><span>Navegações<strong>{totais.acessos.toLocaleString("pt-BR")}</strong></span></span>
        <span><i className="legenda-visualizacoes" /><span>Aberturas<strong>{totais.visualizacoes.toLocaleString("pt-BR")}</strong></span></span>
        <span><i className="legenda-downloads" /><span>Downloads<strong>{totais.downloads.toLocaleString("pt-BR")}</strong></span></span>
      </div>
      <div className="area-grafico-uso">
        <div className="escala-grafico" aria-hidden="true">{marcas.map(function marca(valor, indice) { return <span key={indice}>{valor.toLocaleString("pt-BR")}</span>; })}</div>
        <div className="grafico-uso" role="img" aria-label="Navegações na biblioteca, aberturas de material e downloads por dia">
          {dados.map(function coluna(item) {
            const data = new Date(item.dia).toLocaleDateString("pt-BR", { timeZone: "UTC" });
            return (
              <div className="coluna-grafico" key={item.dia}>
                <div className="grupo-barras-grafico">
                  <span className="barra-grafico acessos" style={{ height: altura(item.acessos) }} title={item.acessos + " navegações em " + data}><b>{item.acessos}</b></span>
                  <span className="barra-grafico visualizacoes" style={{ height: altura(item.visualizacoes) }} title={item.visualizacoes + " aberturas em " + data}><b>{item.visualizacoes}</b></span>
                  <span className="barra-grafico downloads" style={{ height: altura(item.downloads) }} title={item.downloads + " downloads em " + data}><b>{item.downloads}</b></span>
                </div>
                <small>{new Date(item.dia).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" })}</small>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ResumoMensal({ dados }) {
  if (!dados.length) return <Vazio titulo="Sem atividade mensal no período" />;
  return <div className="resumo-mensal">{dados.map(item => {
    const rotulo = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(item.mes + "-01T12:00:00Z"));
    return <div className="resumo-mensal-item" key={item.mes}>
      <strong>{rotulo}</strong><GraficoBarras dados={[{ nome: "Navegações", quantidade: item.acessos }, { nome: "Aberturas", quantidade: item.visualizacoes }, { nome: "Downloads", quantidade: item.downloads }]} />
    </div>;
  })}</div>;
}

function nomeAtividade(acao) {
  const nomes = {
    usuario_criado: "Usuário criado",
    usuario_editado: "E-mail atualizado",
    papel_alterado: "Tipo de usuário alterado",
    usuario_ativado: "Conta liberada",
    usuario_desativado: "Conta bloqueada",
    redefinicao_administrativa_iniciada: "Redefinição de senha enviada",
    acesso_professor_concedido: "Acesso de professor liberado",
    acesso_professor_revogado: "Acesso de professor removido",
    acessos_professor_atualizados: "Acessos de professor atualizados",
    upload: "Material adicionado",
    edicao: "Material editado",
    movimentacao: "Material movido",
    substituicao: "Arquivo trocado",
    lixeira: "Material enviado para a lixeira",
    restauracao: "Material restaurado",
    exclusao: "Material excluído",
    classificacao: "Organização de pasta atualizada",
    sincronizacao: "Materiais atualizados"
  };
  return nomes[acao] || String(acao).replace(/_/g, " ");
}

function AdministracaoFase7({ usuario, area, aoMensagem, aoErro }) {
  const [usuarios, definirUsuarios] = useState([]);
  const [paginacao, definirPaginacao] = useState(null);
  const [busca, definirBusca] = useState("");
  const [papel, definirPapel] = useState("");
  const [estado, definirEstado] = useState("");
  const [novoAberto, definirNovoAberto] = useState(false);
  const [analytics, definirAnalytics] = useState(null);
  const [periodo, definirPeriodo] = useState(30);
  const [auditoria, definirAuditoria] = useState(null);
  const [acao, definirAcao] = useState("");
  const [carregando, definirCarregando] = useState(false);
  const [confirmacao, definirConfirmacao] = useState(null);
  const [emailEmEdicao, definirEmailEmEdicao] = useState("");
  const [nomeEmEdicao, definirNomeEmEdicao] = useState("");
  const [detalhes, definirDetalhes] = useState(null);
  const [alunoFaixa, definirAlunoFaixa] = useState(null);
  const [todos, definirTodos] = useState(false);
  const consultaAtual = useRef(0);
  const filtrosAplicados = useRef({busca:"",papel:"",ativo:""});

  async function carregarUsuarios(pagina = 1, mostrarTodos = false, aplicarFiltros = false) {
    const numeroConsulta = ++consultaAtual.current;
    if (aplicarFiltros) filtrosAplicados.current = {busca,papel,ativo:estado};
    definirTodos(mostrarTodos);
    definirCarregando(true);
    try {
      let resultado = await listarUsuarios({ ...filtrosAplicados.current, pagina, limite: 50 });
      if (!mostrarTodos && pagina > resultado.paginacao.totalPaginas) {
        resultado = await listarUsuarios({...filtrosAplicados.current,pagina:resultado.paginacao.totalPaginas,limite:50});
      }
      let itens = resultado.usuarios;
      // Reutiliza a paginação do endpoint. Nunca pede uma consulta ilimitada.
      if (mostrarTodos) {
        for (let p=2;p<=resultado.paginacao.totalPaginas;p++) {
          if (numeroConsulta !== consultaAtual.current) return;
          const proxima = await listarUsuarios({...filtrosAplicados.current,pagina:p,limite:50});
          itens = itens.concat(proxima.usuarios);
        }
      }
      if (numeroConsulta !== consultaAtual.current) return;
      definirUsuarios([...new Map(itens.map(item=>[item.id,item])).values()]);
      definirPaginacao(resultado.paginacao);
    } catch (erro) { aoErro(mensagemHumana(erro)); }
    finally { if (numeroConsulta === consultaAtual.current) definirCarregando(false); }
  }

  async function carregarAnalytics() {
    definirCarregando(true);
    try { definirAnalytics(await obterAnalytics(periodo)); } catch (erro) { aoErro(mensagemHumana(erro)); }
    finally { definirCarregando(false); }
  }

  async function carregarAuditoria() {
    definirCarregando(true);
    try { definirAuditoria(await obterAuditoria({ acao: acao, pagina: 1, limite: 50 })); } catch (erro) { aoErro(mensagemHumana(erro)); }
    finally { definirCarregando(false); }
  }

  useEffect(function carregarArea() {
    if (area === "usuarios") carregarUsuarios();
    if (area === "estatisticas") carregarAnalytics();
    if (area === "historico") carregarAuditoria();
  }, [area, periodo, acao]);

  async function adicionar(evento) {
    evento.preventDefault();
    const elementoFormulario = evento.currentTarget;
    const formulario = new FormData(elementoFormulario);
    try {
      await criarUsuario({ nome: formulario.get("nome"), email: formulario.get("email"), senha: formulario.get("senha"), papel: formulario.get("papel") });
      elementoFormulario.reset();
      definirNovoAberto(false);
      aoMensagem("Usuário criado com sucesso.");
      await carregarUsuarios();
    } catch (erro) { aoErro(mensagemHumana(erro)); }
  }

  function mudarEmail(item) {
    definirNomeEmEdicao(item.nome);
    definirEmailEmEdicao(item.email);
    definirConfirmacao({ tipo: "dados", item: item, titulo: "Editar pessoa", texto: "Confira o nome e o e-mail antes de salvar." });
  }

  function mudarPapel(item, novoPapel) {
    if (novoPapel === item.papel) return;
    definirConfirmacao({ tipo: "papel", item: item, valor: novoPapel, titulo: "Alterar tipo de usuário?", texto: "A conta passará a ser do tipo " + nomePapel(novoPapel) + "." });
  }

  function alternar(item) {
    definirConfirmacao({ tipo: "estado", item: item, titulo: item.ativo ? "Bloquear esta conta?" : "Liberar esta conta?", texto: item.ativo ? "O usuário perderá o acesso ao sistema imediatamente." : "O usuário poderá entrar no sistema novamente." });
  }

  function redefinir(item) {
    definirConfirmacao({ tipo: "senha", item: item, titulo: "Redefinir a senha?", texto: "Enviaremos as instruções para " + item.email + "." });
  }

  async function escolherAcao(tipo,item) {
    if (tipo === 'faixa' && item.papel === 'aluno') return definirAlunoFaixa(item);
    if (tipo === "dados") return mudarEmail(item);
    if (tipo === "senha") return redefinir(item);
    if (tipo === "estado") return alternar(item);
    if (tipo === "detalhes") {
      try { definirDetalhes((await obterDetalhesUsuario(item.id)).usuario); }
      catch (erro) { aoErro(mensagemHumana(erro)); }
      return;
    }
    const textos = {
      verificar:["Enviar verificação de e-mail?","O usuário receberá um link para confirmar o endereço atual. Isso não bloqueia o acesso de contas existentes."],
      regularizar:["Solicitar revisão do e-mail?","Mostraremos um aviso na conta para revisar o endereço. O acesso continuará normal."],
      excluir:["Excluir esta conta?","O acesso será encerrado e a conta sairá da gestão e dos totais. Histórico e vínculos serão preservados; o e-mail continuará reservado."]
    };
    definirConfirmacao({tipo,item,titulo:textos[tipo][0],texto:textos[tipo][1]});
  }

  function dataDetalhe(data) { return data ? new Date(data).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"}) : "Sem registro"; }
  function inatividade(segundos) {
    if (segundos === null) return "Nunca acessou";
    if (segundos < 3600) return Math.floor(segundos/60)+" minutos";
    if (segundos < 86400) return Math.floor(segundos/3600)+" horas";
    return Math.floor(segundos/86400)+" dias";
  }

  async function confirmarAcao(evento) {
    evento.preventDefault();
    if (!confirmacao) return;
    definirCarregando(true);
    try {
      if (confirmacao.tipo === "dados") {
        if (emailEmEdicao === confirmacao.item.email && nomeEmEdicao === confirmacao.item.nome) { definirConfirmacao(null); return; }
        await editarUsuario(confirmacao.item.id, nomeEmEdicao, emailEmEdicao);
        aoMensagem("Dados atualizados.");
      }
      if (confirmacao.tipo === "papel") {
        await alterarPapelUsuario(confirmacao.item.id, confirmacao.valor);
        aoMensagem("Tipo de usuário atualizado.");
      }
      if (confirmacao.tipo === "estado") {
        await alterarEstadoUsuario(confirmacao.item.id, !confirmacao.item.ativo);
        aoMensagem(confirmacao.item.ativo ? "Conta bloqueada." : "Conta liberada.");
      }
      if (confirmacao.tipo === "senha") {
        const resultado = await iniciarRedefinicaoUsuario(confirmacao.item.id);
        aoMensagem(resultado.mensagem);
      }
      if (["excluir","verificar","regularizar"].includes(confirmacao.tipo)) {
        const funcoes = {excluir:excluirUsuario,verificar:enviarVerificacaoUsuario,regularizar:regularizarEmailUsuario};
        aoMensagem((await funcoes[confirmacao.tipo](confirmacao.item.id)).mensagem);
      }
      definirConfirmacao(null);
      await carregarUsuarios(todos ? 1 : (paginacao?.pagina || 1),todos);
    } catch (erro) { aoErro(mensagemHumana(erro)); }
    finally { definirCarregando(false); }
  }

  return (
    <section className="administracao-fase7">
      {alunoFaixa && createPortal(<CorrecaoFaixaEtariaAdmin aluno={alunoFaixa} aoFechar={() => definirAlunoFaixa(null)} aoConcluir={mensagem => { definirAlunoFaixa(null); aoMensagem(mensagem); }} />,document.body)}
      {carregando && <Esqueleto linhas={4} texto="Atualizando informações..." />}

      {area === "usuarios" && <section className="bloco-admin painel-conteudo">
        <div className="cabecalho-bloco"><div><h2>Contas cadastradas</h2><p>Busque uma pessoa ou ajuste seu acesso.</p></div><button type="button" className="botao-principal" onClick={function abrir() { definirNovoAberto(!novoAberto); }}><Icone nome={novoAberto ? "fechar" : "mais"} />{novoAberto ? "Fechar formulário" : "Novo usuário"}</button></div>
        {novoAberto && <form className="formulario-edicao" onSubmit={adicionar}><label>Nome e sobrenome<input name="nome" autoComplete="name" placeholder="Ex.: Ana Silva" pattern={"\\s*\\S+(?:\\s+\\S+)+\\s*"} title="Informe seu nome e pelo menos um sobrenome. Exemplo: Ana Silva." minLength="2" maxLength="120" required /><small>Informe seu nome e pelo menos um sobrenome.</small></label><label>E-mail<input name="email" type="email" required /></label><label>Senha temporária<CampoSenha name="senha" minLength="12" maxLength="128" autoComplete="new-password" required /></label><label>Tipo de usuário<select name="papel"><option value="aluno">Aluno</option><option value="professor">Professor</option><option value="admin">Administrador</option></select></label><button type="submit">Criar usuário</button></form>}
        <form className="filtros-admin" onSubmit={function pesquisar(evento) { evento.preventDefault(); carregarUsuarios(1,false,true); }}><label>Buscar<input type="search" value={busca} onChange={function mudar(evento) { definirBusca(evento.target.value); }} placeholder="Nome ou e-mail" /></label><label>Tipo<select value={papel} onChange={function mudar(evento) { definirPapel(evento.target.value); }}><option value="">Todos</option><option value="aluno">Alunos</option><option value="professor">Professores</option><option value="admin">Administradores</option></select></label><label>Conta<select value={estado} onChange={function mudar(evento) { definirEstado(evento.target.value); }}><option value="">Todas</option><option value="true">Liberadas</option><option value="false">Bloqueadas</option></select></label><button type="submit">Buscar</button></form>
        <ul className="lista-administrativa lista-usuarios">{usuarios.map(function renderizar(item) { return <li key={item.id} className={item.ativo ? "" : "inativo"}><span className="identidade-usuario"><span className={"monograma-usuario " + item.papel}>{item.nome.slice(0, 1).toUpperCase()}</span><span><strong>{item.nome}</strong><small>{item.email}</small><small>{nomePapel(item.papel)} · <span className={item.ativo ? "estado-conta ativo" : "estado-conta"}>{item.ativo ? "Conta liberada" : "Conta bloqueada"}</span></small></span></span><div className="controles-usuario"><select aria-label={"Tipo de usuário de " + item.nome} value={item.papel} disabled={item.id === usuario.id} onChange={function mudar(evento) { mudarPapel(item, evento.target.value); }}><option value="aluno">Aluno</option><option value="professor">Professor</option><option value="admin">Administrador</option></select><MenuUsuario key={consultaAtual.current} item={item} proprio={item.id === usuario.id} aoAcao={escolherAcao} /></div></li>; })}</ul>
        {!usuarios.length && !carregando && <Vazio titulo="Nenhum usuário encontrado" texto="Tente outra busca ou altere os filtros." />}
        {paginacao && <div className="paginacao-usuarios"><span>{usuarios.length} de {paginacao.total} contas · {todos ? "Todas as páginas" : "Página " + paginacao.pagina + " de " + paginacao.totalPaginas}</span><button type="button" disabled={carregando || todos || paginacao.pagina<=1} onClick={()=>carregarUsuarios(paginacao.pagina-1)}>Anterior</button><button type="button" disabled={carregando || todos || paginacao.pagina>=paginacao.totalPaginas} onClick={()=>carregarUsuarios(paginacao.pagina+1)}>Próxima</button><button type="button" disabled={carregando} onClick={()=>carregarUsuarios(1,!todos)}>{todos?"Usar páginas":"Mostrar todos"}</button></div>}
      </section>}

      {area === "estatisticas" && analytics && <section className="bloco-admin painel-conteudo">
        <div className="cabecalho-bloco"><div><h2>Visão geral</h2><p>Acervo e atividade da biblioteca, sem confundir navegações com pessoas.</p></div><div className="acoes-cabecalho"><label className="periodo-estatisticas">Período<select value={periodo} onChange={evento => definirPeriodo(Number(evento.target.value))}><option value="7">7 dias</option><option value="30">30 dias</option><option value="90">90 dias</option></select></label><a className="botao-secundario" href={obterUrlRelatorio(periodo)}><Icone nome="download" />Relatório CSV</a></div></div>
        <div className="grade-estatisticas"><CartaoNumero titulo="Materiais" valor={analytics.resumo.materiais} /><CartaoNumero titulo="PDFs" valor={analytics.resumo.pdfs} /><CartaoNumero titulo="Vídeos" valor={analytics.resumo.videos} /><CartaoNumero titulo="Contas ativas" valor={analytics.resumo.usuariosAtivos} /><CartaoNumero titulo="Alunos" valor={analytics.resumo.alunos} /><CartaoNumero titulo="Professores" valor={analytics.resumo.professores} /></div>
        <p className="analytics-escopo"><strong>Atividade somente de alunos.</strong> Navegações, aberturas, downloads e buscas de administradores e professores não entram nos gráficos e rankings abaixo. Os registros originais são preservados. Os cartões de contas e acervo mostram o cadastro atual, não o uso no período.</p>
        {!!analytics.cobertura?.eventosComPerfilAtual && <p className="texto-apoio">Eventos anteriores à identificação do perfil no momento da ação são classificados pelo perfil atual da conta. Mudanças antigas de perfil não podem ser reconstruídas.</p>}
        {!!analytics.cobertura?.historicoSemSegmentacao.length && <details className="analytics-legado"><summary>Histórico preservado sem separação de perfis</summary><p>Estes totais antigos podem incluir alunos, professores e administradores. Não entram nos gráficos de alunos e continuam disponíveis aqui e no CSV.</p><ul>{analytics.cobertura.historicoSemSegmentacao.map(item => <li key={item.dia}>{new Date(item.dia).toLocaleDateString("pt-BR", { timeZone: "UTC" })}: {item.navegacoes} navegações · {item.aberturas} aberturas · {item.downloads} downloads</li>)}</ul></details>}
        <section className="painel-grafico"><div><h3>Atividade dos alunos por dia</h3><p>Navegação = entrada em uma pasta ou na biblioteca (limitada por pessoa, pasta e hora). Abertura = PDF/vídeo; download = arquivo baixado. Não são logins nem visitantes únicos. Dias sem registros não aparecem.</p></div><GraficoUso dados={analytics.evolucao} /></section>
        <div className="grade-admin grade-dados grade-engajamento">
          <section><h3>Engajamento dos alunos</h3><p>Pessoas distintas nos {periodo} dias selecionados. Os grupos podem se sobrepor; não some as barras.</p>
            {analytics.cobertura?.engajamentoParcial && <p className="texto-apoio">Contagem de pessoas parcial: considera apenas os eventos detalhados ainda disponíveis. Os totais diários consolidados continuam nos gráficos de atividade.</p>}
            <GraficoBarras unidade="alunos" dados={[{ nome: "Navegaram", quantidade: analytics.engajamento.alunosComNavegacao }, { nome: "Abriram ou baixaram material", quantidade: analytics.engajamento.alunosComMaterial }]} />
            <p>{analytics.engajamento.taxaDeInteracao}% dos alunos que navegaram também abriram ou baixaram material.</p><p>{analytics.engajamento.buscas} pesquisas de alunos nos eventos detalhados.</p>
          </section>
          <section><h3>Atividade dos alunos por mês</h3><p>Totais dos dias incluídos no período selecionado; meses nas pontas podem ser parciais. Não representa pessoas únicas.</p><ResumoMensal dados={analytics.evolucaoMensal} /></section>
          <section><h3>Alunos que navegaram por dia</h3><p>Cada aluno conta uma vez por dia. A mesma pessoa pode aparecer em vários dias.</p><div className="analytics-lista-rolavel"><GraficoBarras unidade="alunos" dados={analytics.evolucao.map(item => ({ nome: new Date(item.dia).toLocaleDateString("pt-BR", { timeZone: "UTC" }), quantidade: item.alunosAtivos }))} /></div></section>
          <section><h3>Composição do acervo</h3><p>Materiais disponíveis atualmente, independentemente do período selecionado.</p><GraficoComposicao unidade="materiais" dados={[{ nome: "PDFs", quantidade: analytics.resumo.pdfs }, { nome: "Vídeos", quantidade: analytics.resumo.videos }]} /></section>
        </div>
        <div className="grade-admin grade-dados">
          <section><h3>Materiais mais usados pelos alunos</h3><p>Interações = aberturas + downloads, não pessoas únicas.</p><GraficoBarras unidade="interações" dados={analytics.materiaisMaisUsados.map(item => ({ nome: item.nome, quantidade: item.acessos, detalhe: item.visualizacoes + " aberturas · " + item.downloads + " downloads" }))} /></section>
          <section><h3>Termos mais pesquisados pelos alunos</h3><p>Uma ocorrência por aluno e termo a cada dia.</p><GraficoBarras dados={analytics.termosMaisPesquisados.map(item => ({ nome: item.termo, quantidade: item.quantidade }))} /></section>
          <section><h3>Pastas mais acessadas pelos alunos</h3><GraficoBarras unidade="navegações" dados={analytics.pastasMaisAcessadas} /></section>
          <section><h3>Materiais por disciplina</h3><p>Distribuição atual do acervo, não atividade dos usuários.</p><GraficoBarras unidade="materiais" dados={analytics.materiaisPorDisciplina} /></section>
          <section><h3>Materiais por concurso</h3><p>Distribuição atual do acervo, não atividade dos usuários.</p><GraficoBarras unidade="materiais" dados={analytics.materiaisPorConcurso} /></section>
        </div>
        <details className="analytics-legado"><summary>Operações de gestão da biblioteca — equipe</summary><p>Uploads, edições e demais operações administrativas. Não entram nos gráficos de uso dos alunos.</p><GraficoBarras dados={analytics.atividadeDoAcervo.map(item => ({nome: nomeAtividade(item.acao), quantidade: item.quantidade}))} /></details>
      </section>}

      {area === "historico" && auditoria && <section className="bloco-admin painel-conteudo"><div className="cabecalho-bloco"><div><h2>Histórico de atividades</h2><p>Acompanhe ações importantes realizadas no sistema.</p></div></div><label className="filtro-historico">Mostrar<select value={acao} onChange={function mudar(evento) { definirAcao(evento.target.value); }}><option value="">Todas as atividades</option>{auditoria.acoes.map(function opcao(item) { return <option key={item} value={item}>{nomeAtividade(item)}</option>; })}</select></label><ul className="lista-historico">{auditoria.eventos.map(function evento(item) { return <li key={item.chave}><span className="icone-historico"><Icone nome="historico" /></span><span><strong>{nomeAtividade(item.acao)}</strong><small>{item.descricao} · por {item.ator}</small></span><time>{new Date(item.criadoEm).toLocaleString("pt-BR")}</time></li>; })}</ul>{!auditoria.eventos.length && <Vazio titulo="Nenhuma atividade encontrada" texto="Altere o filtro para consultar outros registros." />}</section>}

      {confirmacao && createPortal(<Modal titulo={confirmacao.titulo} aoFechar={function fechar() { definirConfirmacao(null); }}><form onSubmit={confirmarAcao}><p><strong>{confirmacao.item.nome}</strong><br />{confirmacao.item.email}</p><p>{confirmacao.texto}</p>{confirmacao.tipo === "dados" && <><label>Nome<input value={nomeEmEdicao} minLength="2" maxLength="120" onChange={function mudar(evento) { definirNomeEmEdicao(evento.target.value); }} autoFocus required /></label><label>E-mail<input type="email" value={emailEmEdicao} onChange={function mudar(evento) { definirEmailEmEdicao(evento.target.value); }} required /></label></>}<div className="acoes-formulario"><button type="submit" className={(confirmacao.tipo === "excluir" || (confirmacao.tipo === "estado" && confirmacao.item.ativo)) ? "perigo" : "botao-principal"} disabled={carregando}>{carregando ? "Concluindo..." : "Confirmar"}</button><button type="button" className="botao-secundario" onClick={function fechar() { definirConfirmacao(null); }}>Cancelar</button></div></form></Modal>,document.body)}
      {detalhes && createPortal(<Modal titulo={"Detalhes de " + detalhes.nome} aoFechar={()=>definirDetalhes(null)}><dl className="detalhes-usuario">
        {[["Nome",detalhes.nome],["E-mail",detalhes.email],["Tipo",nomePapel(detalhes.papel)],["Status",detalhes.ativo?"Liberada":"Bloqueada"],
          ["Criada em (Brasília)",dataDetalhe(detalhes.criadoEm)], ["Verificação de e-mail",detalhes.emailConfirmadoEm ? "Confirmado em " + dataDetalhe(detalhes.emailConfirmadoEm) : "Sem confirmação registrada; o acesso existente foi preservado"],
          ["Último login (Brasília)",detalhes.ultimoLogin ? dataDetalhe(detalhes.ultimoLogin) : "Nunca acessou"],["Inatividade desde o login",inatividade(detalhes.inatividadeSegundos)]].map(([nome,valor])=><div key={nome}><dt>{nome}</dt><dd>{valor}</dd></div>)}
        </dl><button type="button" onClick={()=>definirDetalhes(null)}>Fechar</button></Modal>,document.body)}
    </section>
  );
}

export default AdministracaoFase7;
