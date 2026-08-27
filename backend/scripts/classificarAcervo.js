const { obterConfiguracao } = require("../src/shared/config/ambiente");
const { criarPool } = require("../src/shared/database/conexao");
const { aplicarClassificacaoAutomatica } = require("../src/modules/materiais/classificacaoAutomatica");

async function classificar() {
  const configuracao = obterConfiguracao();
  const pool = criarPool(configuracao.banco);
  const conexao = await pool.getConnection();
  try {
    await conexao.beginTransaction();
    const resumo = await aplicarClassificacaoAutomatica(conexao);
    await conexao.commit();
    console.log("Classificacao automatica concluida: " + resumo.pastasAlteradas + " ajustes.");
  } catch (erro) {
    await conexao.rollback();
    throw erro;
  } finally {
    conexao.release();
    await pool.end();
  }
}

if (require.main === module) {
  classificar().catch(function tratarErro(erro) {
    console.error("Falha na classificacao automatica: " + erro.message);
    process.exitCode = 1;
  });
}

module.exports = classificar;
