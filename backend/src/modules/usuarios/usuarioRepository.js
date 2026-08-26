const AppError = require("../../shared/errors/AppError");

function mapearUsuario(registro) {
  if (!registro) {
    return null;
  }

  return {
    id: registro.id,
    email: registro.email,
    senhaHash: registro.senha_hash,
    papel: registro.papel,
    ativo: registro.ativo === 1,
    criadoEm: registro.criado_em,
    atualizadoEm: registro.atualizado_em
  };
}

function criarUsuarioRepository(pool) {
  async function buscarPorEmail(email) {
    const [registros] = await pool.execute(
      "SELECT id, email, senha_hash, papel, ativo, criado_em, atualizado_em "
      + "FROM usuarios WHERE email = ? LIMIT 1",
      [email]
    );
    return mapearUsuario(registros[0]);
  }

  async function buscarPorId(usuarioId) {
    const [registros] = await pool.execute(
      "SELECT id, email, senha_hash, papel, ativo, criado_em, atualizado_em "
      + "FROM usuarios WHERE id = ? LIMIT 1",
      [usuarioId]
    );
    return mapearUsuario(registros[0]);
  }

  async function criar(email, senhaHash, papel) {
    try {
      const [resultado] = await pool.execute(
        "INSERT INTO usuarios (email, senha_hash, papel) VALUES (?, ?, ?)",
        [email, senhaHash, papel]
      );
      return buscarPorId(resultado.insertId);
    } catch (erro) {
      if (erro && erro.code === "ER_DUP_ENTRY") {
        throw new AppError("Email ja cadastrado", 409, "EMAIL_JA_CADASTRADO");
      }

      throw erro;
    }
  }

  function criarAluno(email, senhaHash) {
    return criar(email, senhaHash, "aluno");
  }

  function criarAdmin(email, senhaHash) {
    return criar(email, senhaHash, "admin");
  }

  async function contarAdmins() {
    const [registros] = await pool.execute(
      "SELECT COUNT(*) AS quantidade FROM usuarios WHERE papel = ?",
      ["admin"]
    );
    return Number(registros[0].quantidade);
  }

  async function listar() {
    const [registros] = await pool.execute(
      "SELECT id, email, senha_hash, papel, ativo, criado_em, atualizado_em "
      + "FROM usuarios ORDER BY id ASC"
    );
    return registros.map(mapearUsuario);
  }

  async function atualizarAtivo(usuarioId, ativo) {
    const [resultado] = await pool.execute(
      "UPDATE usuarios SET ativo = ? WHERE id = ?",
      [ativo ? 1 : 0, usuarioId]
    );
    return resultado.affectedRows > 0;
  }

  async function atualizarPapel(usuarioId, papel) {
    const [resultado] = await pool.execute(
      "UPDATE usuarios SET papel = ? WHERE id = ?",
      [papel, usuarioId]
    );
    return resultado.affectedRows > 0;
  }

  return {
    buscarPorEmail: buscarPorEmail,
    buscarPorId: buscarPorId,
    criarAluno: criarAluno,
    criarAdmin: criarAdmin,
    contarAdmins: contarAdmins,
    listar: listar,
    atualizarAtivo: atualizarAtivo,
    atualizarPapel: atualizarPapel
  };
}

module.exports = criarUsuarioRepository;

