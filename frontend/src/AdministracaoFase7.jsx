import React, { useEffect, useState } from "react";
import {
  listarUsuarios, criarUsuario, editarUsuario, alterarPapelUsuario,
  alterarEstadoUsuario, iniciarRedefinicaoUsuario, obterAnalytics,
  obterAuditoria, obterUrlRelatorio
} from "./api.js";
import { Esqueleto, Icone, Modal, Vazio, mensagemHumana } from "./ComponentesInterface.jsx";

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
    if (!valor) return "3px";
    return Math.round((valor / limiteDaEscala) * 100) + "%";
  }

  return (
    <div className="grafico-uso-completo">
      <div className="legenda-grafico">
        <span><i className="legenda-acessos" /><span>Acessos<strong>{totais.acessos.toLocaleString("pt-BR")}</strong></span></span>
        <span><i className="legenda-visualizacoes" /><span>Visualizações<strong>{totais.visualizacoes.toLocaleString("pt-BR")}</strong></span></span>
        <span><i className="legenda-downloads" /><span>Downloads<strong>{totais.downloads.toLocaleString("pt-BR")}</strong></span></span>
      </div>
      <div className="area-grafico-uso">
        <div className="escala-grafico" aria-hidden="true">{marcas.map(function marca(valor, indice) { return <span key={indice}>{valor.toLocaleString("pt-BR")}</span>; })}</div>
        <div className="grafico-uso" role="img" aria-label="Acessos, visualizações e downloads dos materiais por dia">
          {dados.map(function coluna(item) {
            const data = new Date(item.dia).toLocaleDateString("pt-BR");
            return (
              <div className="coluna-grafico" key={item.dia}>
                <div className="grupo-barras-grafico">
                  <span className="barra-grafico acessos" style={{ height: altura(item.acessos) }} title={item.acessos + " acessos em " + data}><b>{item.acessos}</b></span>
                  <span className="barra-grafico visualizacoes" style={{ height: altura(item.visualizacoes) }} title={item.visualizacoes + " visualizações em " + data}><b>{item.visualizacoes}</b></span>
                  <span className="barra-grafico downloads" style={{ height: altura(item.downloads) }} title={item.downloads + " downloads em " + data}><b>{item.downloads}</b></span>
                </div>
                <small>{new Date(item.dia).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</small>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
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

  async function carregarUsuarios() {
    definirCarregando(true);
    try {
      const resultado = await listarUsuarios({ busca: busca, papel: papel, ativo: estado, pagina: 1, limite: 50 });
      definirUsuarios(resultado.usuarios);
      definirPaginacao(resultado.paginacao);
    } catch (erro) { aoErro(mensagemHumana(erro)); }
    finally { definirCarregando(false); }
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
    const formulario = new FormData(evento.currentTarget);
    try {
      await criarUsuario({ email: formulario.get("email"), senha: formulario.get("senha"), papel: formulario.get("papel") });
      evento.currentTarget.reset();
      definirNovoAberto(false);
      aoMensagem("Usuário criado com sucesso.");
      await carregarUsuarios();
    } catch (erro) { aoErro(mensagemHumana(erro)); }
  }

  function mudarEmail(item) {
    definirEmailEmEdicao(item.email);
    definirConfirmacao({ tipo: "email", item: item, titulo: "Editar e-mail", texto: "Confira o novo endereço antes de salvar." });
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

  async function confirmarAcao(evento) {
    evento.preventDefault();
    if (!confirmacao) return;
    definirCarregando(true);
    try {
      if (confirmacao.tipo === "email") {
        if (emailEmEdicao === confirmacao.item.email) { definirConfirmacao(null); return; }
        await editarUsuario(confirmacao.item.id, emailEmEdicao);
        aoMensagem("E-mail atualizado.");
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
      definirConfirmacao(null);
      await carregarUsuarios();
    } catch (erro) { aoErro(mensagemHumana(erro)); }
    finally { definirCarregando(false); }
  }

  return (
    <section className="administracao-fase7">
      {carregando && <Esqueleto linhas={4} texto="Atualizando informações..." />}

      {area === "usuarios" && <section className="bloco-admin painel-conteudo">
        <div className="cabecalho-bloco"><div><h2>Contas cadastradas</h2><p>Busque uma pessoa ou ajuste seu acesso.</p></div><button type="button" className="botao-principal" onClick={function abrir() { definirNovoAberto(!novoAberto); }}><Icone nome={novoAberto ? "fechar" : "mais"} />{novoAberto ? "Fechar formulário" : "Novo usuário"}</button></div>
        {novoAberto && <form className="formulario-edicao" onSubmit={adicionar}><label>E-mail<input name="email" type="email" required /></label><label>Senha temporária<input name="senha" type="password" minLength="12" maxLength="128" required /></label><label>Tipo de usuário<select name="papel"><option value="aluno">Aluno</option><option value="professor">Professor</option><option value="admin">Administrador</option></select></label><button type="submit">Criar usuário</button></form>}
        <form className="filtros-admin" onSubmit={function pesquisar(evento) { evento.preventDefault(); carregarUsuarios(); }}><label>Buscar<input type="search" value={busca} onChange={function mudar(evento) { definirBusca(evento.target.value); }} placeholder="E-mail" /></label><label>Tipo<select value={papel} onChange={function mudar(evento) { definirPapel(evento.target.value); }}><option value="">Todos</option><option value="aluno">Alunos</option><option value="professor">Professores</option><option value="admin">Administradores</option></select></label><label>Conta<select value={estado} onChange={function mudar(evento) { definirEstado(evento.target.value); }}><option value="">Todas</option><option value="true">Liberadas</option><option value="false">Bloqueadas</option></select></label><button type="submit">Buscar</button></form>
        <ul className="lista-administrativa lista-usuarios">{usuarios.map(function renderizar(item) { return <li key={item.id} className={item.ativo ? "" : "inativo"}><span className="identidade-usuario"><span className={"monograma-usuario " + item.papel}>{item.email.slice(0, 1).toUpperCase()}</span><span><strong>{item.email}</strong><small>{nomePapel(item.papel)} · <span className={item.ativo ? "estado-conta ativo" : "estado-conta"}>{item.ativo ? "Conta liberada" : "Conta bloqueada"}</span></small></span></span><div className="controles-usuario"><select aria-label={"Tipo de usuário de " + item.email} value={item.papel} disabled={item.id === usuario.id} onChange={function mudar(evento) { mudarPapel(item, evento.target.value); }}><option value="aluno">Aluno</option><option value="professor">Professor</option><option value="admin">Administrador</option></select><details className="menu-acoes-usuario"><summary aria-label={"Mais opções para " + item.email}><Icone nome="opcoes" /><span>Opções</span></summary><div><button type="button" onClick={function editar() { mudarEmail(item); }}>Editar e-mail</button><button type="button" onClick={function senha() { redefinir(item); }}>Redefinir senha</button><button type="button" className={item.ativo ? "perigo-texto" : ""} disabled={item.id === usuario.id} onClick={function estadoConta() { alternar(item); }}>{item.ativo ? "Bloquear conta" : "Liberar conta"}</button></div></details></div></li>; })}</ul>
        {!usuarios.length && !carregando && <Vazio titulo="Nenhum usuário encontrado" texto="Tente outra busca ou altere os filtros." />}
        {paginacao && <p className="texto-apoio">{paginacao.total} usuário(s) encontrado(s).</p>}
      </section>}

      {area === "estatisticas" && analytics && <section className="bloco-admin painel-conteudo"><div className="cabecalho-bloco"><div><h2>Visão geral</h2><p>Dados reais dos materiais e de sua utilização.</p></div><div className="acoes-cabecalho"><label className="periodo-estatisticas">Período<select value={periodo} onChange={function mudar(evento) { definirPeriodo(Number(evento.target.value)); }}><option value="7">7 dias</option><option value="30">30 dias</option><option value="90">90 dias</option></select></label><a className="botao-secundario" href={obterUrlRelatorio(periodo)}><Icone nome="download" />Relatório CSV</a></div></div><div className="grade-estatisticas"><CartaoNumero titulo="Materiais" valor={analytics.resumo.materiais} /><CartaoNumero titulo="PDFs" valor={analytics.resumo.pdfs} /><CartaoNumero titulo="Vídeos" valor={analytics.resumo.videos} /><CartaoNumero titulo="Contas ativas" valor={analytics.resumo.usuariosAtivos} /><CartaoNumero titulo="Alunos" valor={analytics.resumo.alunos} /><CartaoNumero titulo="Professores" valor={analytics.resumo.professores} /></div><section className="painel-grafico"><div><h3>Uso dos materiais</h3><p>Acessos, visualizações e downloads por dia.</p></div><GraficoUso dados={analytics.evolucao} /></section><div className="grade-admin grade-dados"><div><h3>Materiais mais usados</h3><ol className="lista-simples">{analytics.materiaisMaisUsados.map(function item(material) { return <li key={material.id}><strong>{material.nome}</strong><small>{material.visualizacoes} visualizações · {material.downloads} downloads</small></li>; })}</ol>{!analytics.materiaisMaisUsados.length && <Vazio titulo="Ainda não há uso registrado" texto="Os dados aparecerão conforme os materiais forem utilizados." />}</div><div><h3>Termos mais pesquisados</h3><ol className="lista-simples">{analytics.termosMaisPesquisados.map(function item(busca) { return <li key={busca.termo}><strong>{busca.termo}</strong><small>{busca.quantidade} busca(s)</small></li>; })}</ol>{!analytics.termosMaisPesquisados.length && <Vazio titulo="Nenhuma pesquisa no período" />}</div><div><h3>Pastas mais acessadas</h3><ol className="lista-simples">{analytics.pastasMaisAcessadas.map(function item(pasta, indice) { return <li key={pasta.nome + "-" + indice}><strong>{pasta.nome}</strong><small>{pasta.quantidade} acesso(s)</small></li>; })}</ol></div><div><h3>Atividade da biblioteca</h3><ul className="lista-simples">{analytics.atividadeDoAcervo.map(function item(atividade) { return <li key={atividade.acao}><strong>{nomeAtividade(atividade.acao)}</strong><small>{atividade.quantidade} ocorrência(s)</small></li>; })}</ul></div></div></section>}

      {area === "historico" && auditoria && <section className="bloco-admin painel-conteudo"><div className="cabecalho-bloco"><div><h2>Histórico de atividades</h2><p>Acompanhe ações importantes realizadas no sistema.</p></div></div><label className="filtro-historico">Mostrar<select value={acao} onChange={function mudar(evento) { definirAcao(evento.target.value); }}><option value="">Todas as atividades</option>{auditoria.acoes.map(function opcao(item) { return <option key={item} value={item}>{nomeAtividade(item)}</option>; })}</select></label><ul className="lista-historico">{auditoria.eventos.map(function evento(item) { return <li key={item.chave}><span className="icone-historico"><Icone nome="historico" /></span><span><strong>{nomeAtividade(item.acao)}</strong><small>{item.descricao} · por {item.ator}</small></span><time>{new Date(item.criadoEm).toLocaleString("pt-BR")}</time></li>; })}</ul>{!auditoria.eventos.length && <Vazio titulo="Nenhuma atividade encontrada" texto="Altere o filtro para consultar outros registros." />}</section>}

      {confirmacao && <Modal titulo={confirmacao.titulo} aoFechar={function fechar() { definirConfirmacao(null); }}><form onSubmit={confirmarAcao}><p>{confirmacao.texto}</p>{confirmacao.tipo === "email" && <label>Novo e-mail<input type="email" value={emailEmEdicao} onChange={function mudar(evento) { definirEmailEmEdicao(evento.target.value); }} autoFocus required /></label>}<div className="acoes-formulario"><button type="submit" className={confirmacao.tipo === "estado" && confirmacao.item.ativo ? "perigo" : "botao-principal"} disabled={carregando}>{carregando ? "Concluindo..." : "Confirmar"}</button><button type="button" className="botao-secundario" onClick={function fechar() { definirConfirmacao(null); }}>Cancelar</button></div></form></Modal>}
    </section>
  );
}

export default AdministracaoFase7;
