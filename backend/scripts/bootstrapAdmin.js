const { obterConfiguracao } = require("../src/shared/config/ambiente");
const { criarPool } = require("../src/shared/database/conexao");
const criarUsuarioRepository = require("../src/modules/usuarios/usuarioRepository");
const {
  normalizarEmail,
  validarSenha
} = require("../src/modules/autenticacao/autenticacaoValidator");
const { criarHashDaSenha } = require("../src/modules/autenticacao/senha");

async function executarBootstrapAdmin(pool, emailInformado, senhaInformada) {
  const email = normalizarEmail(emailInformado);
  const senha = validarSenha(senhaInformada);
  const conexao = await pool.getConnection();

  try {
    const [resultadoDoLock] = await conexao.execute(
      "SELECT GET_LOCK(?, 10) AS lock_obtido",
      ["plantel_listas_bootstrap_admin"]
    );

    if (resultadoDoLock[0].lock_obtido !== 1) {
      throw new Error("Nao foi possivel obter lock do bootstrap admin");
    }

    const usuarioRepository = criarUsuarioRepository(conexao);
    const quantidadeDeAdmins = await usuarioRepository.contarAdmins();
    if (quantidadeDeAdmins > 0) {
      throw new Error("Bootstrap recusado: ja existe um admin");
    }

    const senhaHash = await criarHashDaSenha(senha);
    const nome = String(process.env.BOOTSTRAP_ADMIN_NAME || "Administrador").trim();
    return usuarioRepository.criarAdmin(nome, email, senhaHash);
  } finally {
    try {
      await conexao.execute("SELECT RELEASE_LOCK(?)", ["plantel_listas_bootstrap_admin"]);
    } finally {
      conexao.release();
    }
  }
}

async function executarPeloAmbiente() {
  const configuracao = obterConfiguracao();
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const senha = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!email || !senha) {
    throw new Error(
      "Defina BOOTSTRAP_ADMIN_EMAIL e BOOTSTRAP_ADMIN_PASSWORD somente no ambiente local"
    );
  }

  const pool = criarPool(configuracao.banco);
  try {
    const usuario = await executarBootstrapAdmin(pool, email, senha);
    console.log("Primeiro admin criado com id " + usuario.id);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  executarPeloAmbiente().catch(function tratarFalha(erro) {
    console.error("Falha no bootstrap do admin: " + erro.message);
    process.exitCode = 1;
  });
}

module.exports = executarBootstrapAdmin;

