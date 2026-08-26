const argon2 = require("argon2");

const OPCOES_ARGON2ID = Object.freeze({
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32
});

let hashDeComparacaoPromise;

function criarHashDaSenha(senha) {
  return argon2.hash(senha, OPCOES_ARGON2ID);
}

function verificarSenha(senhaHash, senha) {
  return argon2.verify(senhaHash, senha);
}

async function verificarSenhaSemEnumerar(senhaHash, senha) {
  if (senhaHash) {
    return verificarSenha(senhaHash, senha);
  }

  if (!hashDeComparacaoPromise) {
    hashDeComparacaoPromise = criarHashDaSenha("comparacao-interna-sem-usuario");
  }

  const hashDeComparacao = await hashDeComparacaoPromise;
  await verificarSenha(hashDeComparacao, senha);
  return false;
}

module.exports = {
  criarHashDaSenha: criarHashDaSenha,
  verificarSenha: verificarSenha,
  verificarSenhaSemEnumerar: verificarSenhaSemEnumerar,
  OPCOES_ARGON2ID: OPCOES_ARGON2ID
};

