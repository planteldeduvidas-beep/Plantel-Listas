import React from "react";

export default function FiltrosUsuarios({ busca, papel, estado, emailConfirmado, ordenacao, aoMudar, aoBuscar, ocupado }) {
  function campo(nome) { return evento => aoMudar(nome, evento.target.value); }
  return <form className="filtros-admin filtros-gestao-usuarios" onSubmit={evento => { evento.preventDefault(); aoBuscar(); }}>
    <label>Buscar pessoa<input type="search" value={busca} onChange={campo("busca")} placeholder="Nome ou e-mail" /></label>
    <label>Tipo<select value={papel} onChange={campo("papel")}><option value="">Todos</option><option value="aluno">Alunos</option><option value="professor">Professores</option><option value="admin">Administradores</option></select></label>
    <label>Conta<select value={estado} onChange={campo("estado")}><option value="">Todas</option><option value="true">Liberadas</option><option value="false">Bloqueadas</option></select></label>
    <label>Confirmação de e-mail<select value={emailConfirmado} onChange={campo("emailConfirmado")}><option value="">Todos os e-mails</option><option value="true">Confirmados</option><option value="false">Não confirmados</option></select></label>
    <label>Mostrar primeiro<select value={ordenacao} onChange={campo("ordenacao")}>
      <option value="email">E-mail (A–Z)</option><option value="mais_inativos">Mais tempo sem entrar</option><option value="menos_inativos">Menos tempo sem entrar</option>
      <option value="cadastro_recente">Cadastros mais recentes</option><option value="cadastro_antigo">Cadastros mais antigos</option><option value="login_recente">Entraram recentemente</option><option value="nunca_entrou">Somente quem nunca entrou</option>
    </select></label><button type="submit" disabled={ocupado}>Aplicar filtros</button>
    <p className="explicacao-filtros-usuarios">O tempo sem entrar considera o último login registrado, não a última página visitada. Em “Mais tempo sem entrar”, contas sem login aparecem primeiro. Cadastros aguardando confirmação inicial continuam na área de cadastros pendentes.</p>
  </form>;
}
