import React, { useEffect, useState } from "react";
import {
  listarUsuarios, criarUsuario, editarUsuario, alterarPapelUsuario,
  alterarEstadoUsuario, iniciarRedefinicaoUsuario, obterAnalytics,
  obterAuditoria, obterUrlRelatorio
} from "./api.js";

function nomePapel(papel) {
  return { aluno: "Aluno", professor: "Professor", admin: "Administrador" }[papel] || "Usuário";
}

function CartaoNumero({ titulo, valor }) {
  return <article className="cartao-estatistica"><span>{titulo}</span><strong>{valor}</strong></article>;
}

function AdministracaoFase7({ usuario, aoMensagem, aoErro }) {
  const [area, definirArea] = useState("usuarios");
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

  async function carregarUsuarios() {
    try {
      const resultado = await listarUsuarios({ busca: busca, papel: papel, ativo: estado, pagina: 1, limite: 50 });
      definirUsuarios(resultado.usuarios);
      definirPaginacao(resultado.paginacao);
    } catch (erro) { aoErro(erro.message); }
  }

  async function carregarAnalytics() {
    try { definirAnalytics(await obterAnalytics(periodo)); } catch (erro) { aoErro(erro.message); }
  }

  async function carregarAuditoria() {
    try { definirAuditoria(await obterAuditoria({ acao: acao, pagina: 1, limite: 50 })); } catch (erro) { aoErro(erro.message); }
  }

  useEffect(function carregarArea() {
    if (area === "usuarios") carregarUsuarios();
    if (area === "estatisticas") carregarAnalytics();
    if (area === "historico") carregarAuditoria();
  }, [area, periodo, acao]);

  async function adicionar(evento) {
    evento.preventDefault();
    const formulario = new FormData(evento.currentTarget);
    try {
      await criarUsuario({ email: formulario.get("email"), senha: formulario.get("senha"), papel: formulario.get("papel") });
      evento.currentTarget.reset();
      definirNovoAberto(false);
      aoMensagem("Usuário criado com sucesso.");
      await carregarUsuarios();
    } catch (erro) { aoErro(erro.message); }
  }

  async function mudarEmail(item) {
    const email = window.prompt("Novo e-mail", item.email);
    if (!email || email === item.email) return;
    try { await editarUsuario(item.id, email); aoMensagem("E-mail atualizado."); await carregarUsuarios(); } catch (erro) { aoErro(erro.message); }
  }

  async function mudarPapel(item, novoPapel) {
    if (novoPapel === item.papel) return;
    if (!window.confirm("Alterar o tipo deste usuário para " + nomePapel(novoPapel) + "?")) return;
    try { await alterarPapelUsuario(item.id, novoPapel); aoMensagem("Tipo de usuário atualizado."); await carregarUsuarios(); } catch (erro) { aoErro(erro.message); }
  }

  async function alternar(item) {
    const texto = item.ativo ? "Bloquear esta conta?" : "Liberar esta conta novamente?";
    if (!window.confirm(texto)) return;
    try { await alterarEstadoUsuario(item.id, !item.ativo); aoMensagem(item.ativo ? "Conta bloqueada." : "Conta liberada."); await carregarUsuarios(); } catch (erro) { aoErro(erro.message); }
  }

  async function redefinir(item) {
    if (!window.confirm("Enviar instruções de redefinição de senha para este usuário?")) return;
    try { const resultado = await iniciarRedefinicaoUsuario(item.id); aoMensagem(resultado.mensagem); } catch (erro) { aoErro(erro.message); }
  }

  return (
    <section className="administracao-fase7">
      <div className="introducao-admin"><h2>Administração</h2><p>Cuide das pessoas, acompanhe o uso do acervo e consulte o histórico.</p></div>
      <nav className="abas-admin" aria-label="Áreas administrativas">
        <button type="button" className={area === "usuarios" ? "ativo" : ""} onClick={function abrir() { definirArea("usuarios"); }}>Usuários</button>
        <button type="button" className={area === "estatisticas" ? "ativo" : ""} onClick={function abrir() { definirArea("estatisticas"); }}>Estatísticas</button>
        <button type="button" className={area === "historico" ? "ativo" : ""} onClick={function abrir() { definirArea("historico"); }}>Histórico de atividades</button>
      </nav>

      {area === "usuarios" && <section className="bloco-admin">
        <div className="cabecalho-bloco"><div><h3>Usuários</h3><p>Encontre uma conta e ajuste somente o necessário.</p></div><button type="button" onClick={function abrir() { definirNovoAberto(!novoAberto); }}>{novoAberto ? "Cancelar" : "+ Novo usuário"}</button></div>
        {novoAberto && <form className="formulario-edicao" onSubmit={adicionar}><label>E-mail<input name="email" type="email" required /></label><label>Senha temporária<input name="senha" type="password" minLength="12" maxLength="128" required /></label><label>Tipo de usuário<select name="papel"><option value="aluno">Aluno</option><option value="professor">Professor</option><option value="admin">Administrador</option></select></label><button type="submit">Criar usuário</button></form>}
        <form className="filtros-admin" onSubmit={function pesquisar(evento) { evento.preventDefault(); carregarUsuarios(); }}><label>Buscar<input type="search" value={busca} onChange={function mudar(evento) { definirBusca(evento.target.value); }} placeholder="E-mail" /></label><label>Tipo<select value={papel} onChange={function mudar(evento) { definirPapel(evento.target.value); }}><option value="">Todos</option><option value="aluno">Alunos</option><option value="professor">Professores</option><option value="admin">Administradores</option></select></label><label>Conta<select value={estado} onChange={function mudar(evento) { definirEstado(evento.target.value); }}><option value="">Todas</option><option value="true">Liberadas</option><option value="false">Bloqueadas</option></select></label><button type="submit">Buscar</button></form>
        <ul className="lista-administrativa lista-usuarios">{usuarios.map(function renderizar(item) { return <li key={item.id} className={item.ativo ? "" : "inativo"}><span><strong>{item.email}</strong><small>{nomePapel(item.papel)} · {item.ativo ? "Conta liberada" : "Conta bloqueada"}</small></span><div><select aria-label={"Tipo de usuário de " + item.email} value={item.papel} disabled={item.id === usuario.id} onChange={function mudar(evento) { mudarPapel(item, evento.target.value); }}><option value="aluno">Aluno</option><option value="professor">Professor</option><option value="admin">Administrador</option></select><button type="button" className="secundario" onClick={function editar() { mudarEmail(item); }}>Editar e-mail</button><button type="button" className="secundario" onClick={function senha() { redefinir(item); }}>Redefinir senha</button><button type="button" className="secundario" disabled={item.id === usuario.id} onClick={function estadoConta() { alternar(item); }}>{item.ativo ? "Bloquear" : "Liberar"}</button></div></li>; })}</ul>
        {paginacao && <p className="texto-apoio">{paginacao.total} usuário(s) encontrado(s).</p>}
      </section>}

      {area === "estatisticas" && analytics && <section className="bloco-admin"><div className="cabecalho-bloco"><div><h3>Estatísticas</h3><p>Uma visão simples do acervo e de seu uso.</p></div><a className="botao-secundario" href={obterUrlRelatorio(periodo)}>Baixar relatório CSV</a></div><label className="periodo-estatisticas">Período<select value={periodo} onChange={function mudar(evento) { definirPeriodo(Number(evento.target.value)); }}><option value="7">7 dias</option><option value="30">30 dias</option><option value="90">90 dias</option></select></label><div className="grade-estatisticas"><CartaoNumero titulo="Materiais" valor={analytics.resumo.materiais} /><CartaoNumero titulo="PDFs" valor={analytics.resumo.pdfs} /><CartaoNumero titulo="Vídeos" valor={analytics.resumo.videos} /><CartaoNumero titulo="Usuários ativos" valor={analytics.resumo.usuariosAtivos} /><CartaoNumero titulo="Alunos" valor={analytics.resumo.alunos} /><CartaoNumero titulo="Professores" valor={analytics.resumo.professores} /></div><div className="grade-admin"><div><h4>Materiais mais usados</h4><ol className="lista-simples">{analytics.materiaisMaisUsados.map(function item(material) { return <li key={material.id}><strong>{material.nome}</strong> — {material.visualizacoes} visualizações, {material.downloads} downloads</li>; })}</ol>{!analytics.materiaisMaisUsados.length && <p className="estado-vazio">Ainda não há uso registrado neste período.</p>}</div><div><h4>Termos mais pesquisados</h4><ol className="lista-simples">{analytics.termosMaisPesquisados.map(function item(busca) { return <li key={busca.termo}>{busca.termo}: {busca.quantidade}</li>; })}</ol>{!analytics.termosMaisPesquisados.length && <p className="estado-vazio">Ainda não há pesquisas registradas.</p>}</div><div><h4>Pastas mais acessadas</h4><ol className="lista-simples">{analytics.pastasMaisAcessadas.map(function item(pasta) { return <li key={pasta.nome}>{pasta.nome}: {pasta.quantidade}</li>; })}</ol></div><div><h4>Atividade do acervo</h4><ul className="lista-simples">{analytics.atividadeDoAcervo.map(function item(atividade) { return <li key={atividade.acao}>{atividade.acao}: {atividade.quantidade}</li>; })}</ul></div></div></section>}

      {area === "historico" && auditoria && <section className="bloco-admin"><div className="cabecalho-bloco"><div><h3>Histórico de atividades</h3><p>Registro somente para consulta; eventos não podem ser editados ou apagados.</p></div></div><label>Tipo de atividade<select value={acao} onChange={function mudar(evento) { definirAcao(evento.target.value); }}><option value="">Todas</option>{auditoria.acoes.map(function opcao(item) { return <option key={item} value={item}>{item.replace(/_/g, " ")}</option>; })}</select></label><ul className="lista-historico">{auditoria.eventos.map(function evento(item) { return <li key={item.chave}><span><strong>{item.acao.replace(/_/g, " ")}</strong><small>{item.descricao} · por {item.ator}</small></span><time>{new Date(item.criadoEm).toLocaleString("pt-BR")}</time></li>; })}</ul>{!auditoria.eventos.length && <p className="estado-vazio">Nenhuma atividade encontrada.</p>}</section>}
    </section>
  );
}

export default AdministracaoFase7;
