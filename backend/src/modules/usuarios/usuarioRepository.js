const AppError = require("../../shared/errors/AppError");
const { normalizarEmail } = require("../autenticacao/autenticacaoValidator");

function emailDuplicado() {
  return new AppError("Já existe uma conta cadastrada com este e-mail.", 409, "EMAIL_JA_CADASTRADO");
}

function mapearUsuario(registro) {
  if (!registro) {
    return null;
  }

  return {
    id: registro.id,
    nome: registro.nome,
    email: registro.email,
    senhaHash: registro.senha_hash,
    cadastroEmailPendente: Boolean(Number(registro.cadastro_email_pendente || 0)),
    versaoSessao: Number(registro.versao_sessao || 1),
    papel: registro.papel,
    ativo: registro.ativo === 1,
    excluidoEm: registro.excluido_em,
    criadoEm: registro.criado_em,
    atualizadoEm: registro.atualizado_em
  };
}

function criarUsuarioRepository(pool) {
  async function comEmailProtegido(emailInformado, usuarioId, executorInformado, gravar) {
    const email = normalizarEmail(emailInformado);
    const conexao = executorInformado || (pool.getConnection ? await pool.getConnection() : pool);
    const transacaoPropria = !executorInformado;
    try {
      if (transacaoPropria) await conexao.beginTransaction();
      // O INSERT/UPDATE da chave unica mantem o lock InnoDB ate COMMIT/ROLLBACK.
      await conexao.execute("INSERT INTO usuarios_email_travas (email) VALUES (?) ON DUPLICATE KEY UPDATE email=VALUES(email)", [email]);
      let mesmoEmail = false;
      let emailParaGravar = email;
      if (usuarioId !== null) {
        const [atual] = await conexao.execute("SELECT email FROM usuarios WHERE id=? FOR UPDATE", [usuarioId]);
        // Editar outros dados de uma conta historica nao exige deduplicacao.
        mesmoEmail = atual.length > 0 && atual[0].email.trim().toLowerCase() === email;
        if (mesmoEmail) emailParaGravar = atual[0].email;
      }
      if (!mesmoEmail) {
        // FOR UPDATE evita um snapshot antigo de transacao externa. Contas
        // bloqueadas tambem reservam o email. Nao normalizar dados historicos.
        const [existentes] = await conexao.execute(
          "SELECT id FROM usuarios WHERE LOWER(TRIM(email))=? LIMIT 1 FOR UPDATE", [email]
        );
        if (existentes.length) throw emailDuplicado();
      }
      const resultado = await gravar(conexao, emailParaGravar);
      if (transacaoPropria) await conexao.commit();
      return resultado;
    } catch (erro) {
      if (transacaoPropria) await conexao.rollback().catch(() => {});
      if (erro?.code === "ER_DUP_ENTRY") throw emailDuplicado();
      if (["ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"].includes(erro?.code)) {
        throw new AppError("Outro cadastro ou alteração está em andamento. Tente novamente.", 409, "ALTERACAO_CONCORRENTE");
      }
      throw erro;
    } finally {
      if (transacaoPropria && conexao !== pool) conexao.release();
    }
  }

  async function buscarPorEmail(email) {
    const [registros] = await pool.execute(
      "SELECT id, nome, email, senha_hash, versao_sessao, papel, ativo, criado_em, atualizado_em, excluido_em "
      + ", EXISTS(SELECT 1 FROM cadastros_email_pendentes p WHERE p.usuario_id=usuarios.id) AS cadastro_email_pendente FROM usuarios WHERE email = ? LIMIT 1",
      [email]
    );
    return mapearUsuario(registros[0]);
  }

  async function buscarPorId(usuarioId, executorInformado, bloquear) {
    const executor = executorInformado || pool;
    const [registros] = await executor.execute(
      "SELECT id, nome, email, senha_hash, versao_sessao, papel, ativo, criado_em, atualizado_em, excluido_em "
      + ", EXISTS(SELECT 1 FROM cadastros_email_pendentes p WHERE p.usuario_id=usuarios.id) AS cadastro_email_pendente FROM usuarios WHERE id = ? LIMIT 1" + (bloquear ? " FOR UPDATE" : ""),
      [usuarioId]
    );
    return mapearUsuario(registros[0]);
  }

  async function criar(nome, email, senhaHash, papel, executorInformado, aguardarConfirmacao = false) {
    return comEmailProtegido(email, null, executorInformado, async (executor, normalizado) => {
      const [resultado] = await executor.execute(
        "INSERT INTO usuarios (nome, email, senha_hash, papel) VALUES (?, ?, ?, ?)",
        [nome, normalizado, senhaHash, papel]
      );
      if (aguardarConfirmacao) await executor.execute("INSERT INTO cadastros_email_pendentes(usuario_id) VALUES (?)", [resultado.insertId]);
      return buscarPorId(resultado.insertId, executor);
    });
  }

  function criarAluno(nome, email, senhaHash) {
    return criar(nome, email, senhaHash, "aluno");
  }

  function criarAdmin(nome, email, senhaHash) {
    return criar(nome, email, senhaHash, "admin");
  }

  async function contarAdmins() {
    const [registros] = await pool.execute(
      "SELECT COUNT(*) AS quantidade FROM usuarios WHERE papel = ?",
      ["admin"]
    );
    return Number(registros[0].quantidade);
  }

  async function listar(filtros) {
    const condicoes = ["excluido_em IS NULL", "NOT EXISTS(SELECT 1 FROM cadastros_email_pendentes p WHERE p.usuario_id=usuarios.id)"];
    const parametros = [];
    if (filtros.busca) { condicoes.push("(nome LIKE ? OR email LIKE ?)"); parametros.push("%" + filtros.busca + "%", "%" + filtros.busca + "%"); }
    if (filtros.papel) { condicoes.push("papel=?"); parametros.push(filtros.papel); }
    if (filtros.ativo !== null) { condicoes.push("ativo=?"); parametros.push(filtros.ativo ? 1 : 0); }
    const onde = condicoes.length ? " WHERE " + condicoes.join(" AND ") : "";
    const [totais] = await pool.execute("SELECT COUNT(*) AS total FROM usuarios" + onde, parametros);
    const [registros] = await pool.execute(
      "SELECT id, nome, email, senha_hash, versao_sessao, papel, ativo, criado_em, atualizado_em "
      + "FROM usuarios" + onde + " ORDER BY email ASC,id ASC LIMIT ? OFFSET ?",
      parametros.concat([filtros.limite, (filtros.pagina - 1) * filtros.limite])
    );
    return { itens: registros.map(mapearUsuario), total: Number(totais[0].total) };
  }

  async function atualizarAtivo(usuarioId, ativo, executorInformado) {
    const executor = executorInformado || pool;
    const [resultado] = await executor.execute(
      "UPDATE usuarios SET ativo = ?,versao_sessao=versao_sessao+1 WHERE id = ?",
      [ativo ? 1 : 0, usuarioId]
    );
    return resultado.affectedRows > 0;
  }

  async function atualizarPapel(usuarioId, papel, executorInformado) {
    const executor = executorInformado || pool;
    const [resultado] = await executor.execute(
      "UPDATE usuarios SET papel = ?,versao_sessao=versao_sessao+1 WHERE id = ?",
      [papel, usuarioId]
    );
    return resultado.affectedRows > 0;
  }

  async function atualizarEmail(usuarioId, email, executorInformado) {
    return comEmailProtegido(email, usuarioId, executorInformado, async (executor, normalizado) => {
      const [resultado] = await executor.execute("UPDATE usuarios SET email_confirmado_em=IF(email=?,email_confirmado_em,NULL),email=? WHERE id=?", [normalizado, normalizado, usuarioId]);
      return resultado.affectedRows > 0;
    });
  }

  async function atualizarDados(usuarioId, nome, email, executorInformado) {
    return comEmailProtegido(email, usuarioId, executorInformado, async (executor, normalizado) => {
      const [resultado] = await executor.execute(
        "UPDATE usuarios SET email_confirmado_em=IF(email=?,email_confirmado_em,NULL),nome=?,email=? WHERE id=?",
        [normalizado, nome, normalizado, usuarioId]
      );
      return resultado.affectedRows > 0;
    });
  }

  async function contarAdminsAtivos(executorInformado) {
    const executor = executorInformado || pool;
    const [registros] = await executor.execute("SELECT COUNT(*) AS quantidade FROM usuarios WHERE papel='admin' AND ativo=1");
    return Number(registros[0].quantidade);
  }

  async function revogarPermissoesDoProfessor(usuarioId, administradorId, executorInformado) {
    const executor = executorInformado || pool;
    await executor.execute(
      "UPDATE permissoes_professor_categoria SET revogada_em=CURRENT_TIMESTAMP(3),revogada_por_usuario_id=? "
      + "WHERE professor_id=? AND revogada_em IS NULL",
      [administradorId, usuarioId]
    );
    await executor.execute("DELETE FROM professor_disciplinas WHERE professor_id=?", [usuarioId]);
  }

  async function comTravaAdministrativa(funcao) {
    const conexao = await pool.getConnection();
    let travaObtida = false;
    try {
      const [travas] = await conexao.execute("SELECT GET_LOCK(LEFT(CONCAT('plantel_admin_usuarios_',DATABASE()),64),5) AS obtida");
      if (Number(travas[0].obtida) !== 1) throw new AppError("Outra alteracao administrativa esta em andamento", 409, "ALTERACAO_CONCORRENTE");
      travaObtida = true;
      await conexao.beginTransaction();
      try {
        const resultado = await funcao(conexao);
        await conexao.commit();
        return resultado;
      } catch (erro) {
        await conexao.rollback().catch(function preservarErroOriginal() {});
        throw erro;
      }
    } finally {
      if (travaObtida) await conexao.execute("SELECT RELEASE_LOCK(LEFT(CONCAT('plantel_admin_usuarios_',DATABASE()),64))").catch(function ignorar() {});
      conexao.release();
    }
  }

  return {
    obterDetalhes: async id => {
      const usuario = await buscarPorId(id);
      if (!usuario || usuario.excluidoEm || usuario.cadastroEmailPendente) return null;
      // Epoch evita interpretar TIMESTAMP com o timezone local do processo Node.
      const [[dados]] = await pool.execute("SELECT UNIX_TIMESTAMP(u.criado_em)*1000 AS criado_ms, UNIX_TIMESTAMP((SELECT MAX(criado_em) FROM sessoes WHERE usuario_id=u.id))*1000 AS login_ms, UNIX_TIMESTAMP(COALESCE(u.email_confirmado_em,(SELECT MAX(usada_em) FROM confirmacoes_email WHERE usuario_id=u.id AND email_destino=u.email AND usada_em IS NOT NULL)))*1000 AS email_ms FROM usuarios u WHERE u.id=?",[id]);
      const data = ms => ms === null ? null : new Date(Number(ms));
      return {...usuario,criadoEm:data(dados.criado_ms),ultimoLogin:data(dados.login_ms),emailConfirmadoEm:data(dados.email_ms)};
    },
    excluirLogicamente: async (id,c) => {
      await c.execute("UPDATE usuarios SET excluido_em=CURRENT_TIMESTAMP(3),ativo=0,versao_sessao=versao_sessao+1 WHERE id=?",[id]);
      await c.execute("UPDATE recuperacoes_senha SET usada_em=COALESCE(usada_em,CURRENT_TIMESTAMP(3)) WHERE usuario_id=?",[id]);
      await c.execute("UPDATE confirmacoes_email SET cancelada_em=COALESCE(cancelada_em,CURRENT_TIMESTAMP(3)) WHERE usuario_id=? AND usada_em IS NULL",[id]);
    },
    regularizarEmail: async (usuario,c) => c.execute("INSERT INTO lembretes_email(usuario_id,email_identificado) VALUES (?,?) ON DUPLICATE KEY UPDATE email_identificado=VALUES(email_identificado),resolvido_em=NULL",[usuario.id,usuario.email]),
    buscarPorEmail: buscarPorEmail,
    buscarPorId: buscarPorId,
    criarAluno: criarAluno,
    criarAlunoComConfirmacao: (nome, email, senhaHash) => criar(nome, email, senhaHash, "aluno", undefined, true),
    criarAdmin: criarAdmin,
    criar: criar,
    contarAdmins: contarAdmins,
    listar: listar,
    atualizarAtivo: atualizarAtivo,
    atualizarPapel: atualizarPapel,
    atualizarEmail: atualizarEmail,
    atualizarDados: atualizarDados,
    contarAdminsAtivos: contarAdminsAtivos,
    revogarPermissoesDoProfessor: revogarPermissoesDoProfessor,
    comTravaAdministrativa: comTravaAdministrativa
  };
}

module.exports = criarUsuarioRepository;

