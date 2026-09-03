const AppError = require("../../shared/errors/AppError");
const {
  gerarTokenAleatorio,
  gerarHashDoToken,
  adicionarHoras,
  adicionarMinutos
} = require("../../shared/utils/tokens");
const {
  validarCredenciais,
  validarCadastro,
  validarSolicitacaoDeRecuperacao,
  validarRedefinicaoDeSenha
} = require("./autenticacaoValidator");
const {
  criarHashDaSenha,
  verificarSenhaSemEnumerar
} = require("./senha");
const criarUsuarioPublico = require("../usuarios/usuarioPublico");

const MENSAGEM_CREDENCIAIS_INVALIDAS = "Email ou senha invalidos";
const MENSAGEM_RECUPERACAO_NEUTRA = "Se existir uma conta associada a este e-mail, enviaremos as instrucoes de recuperacao.";

function criarAutenticacaoService(dependencias) {
  const usuarioRepository = dependencias.usuarioRepository;
  const autenticacaoRepository = dependencias.autenticacaoRepository;
  const emailProvider = dependencias.emailProvider;
  const configuracao = dependencias.configuracao;

  async function cadastrar(corpo) {
    const dados = validarCadastro(corpo);
    const senhaHash = await criarHashDaSenha(dados.senha);
    const usuario = await usuarioRepository.criarAluno(dados.nome, dados.email, senhaHash);
    return criarUsuarioPublico(usuario);
  }

  async function entrar(corpo) {
    const dados = validarCredenciais(corpo);
    const usuario = await usuarioRepository.buscarPorEmail(dados.email);
    const senhaCorreta = await verificarSenhaSemEnumerar(
      usuario ? usuario.senhaHash : null,
      dados.senha
    );

    if (!usuario || !senhaCorreta || !usuario.ativo) {
      throw new AppError(
        MENSAGEM_CREDENCIAIS_INVALIDAS,
        401,
        "CREDENCIAIS_INVALIDAS"
      );
    }

    const token = gerarTokenAleatorio();
    const tokenHash = gerarHashDoToken(token);
    const expiraEm = adicionarHoras(
      new Date(),
      configuracao.seguranca.duracaoSessaoHoras
    );
    await autenticacaoRepository.criarSessao(usuario.id, tokenHash, expiraEm);

    return {
      token: token,
      usuario: criarUsuarioPublico(usuario)
    };
  }

  async function sair(tokenHash) {
    await autenticacaoRepository.revogarSessaoPorHash(tokenHash);
  }

  async function solicitarRecuperacao(corpo) {
    const dados = validarSolicitacaoDeRecuperacao(corpo);
    const usuario = await usuarioRepository.buscarPorEmail(dados.email);

    if (!usuario || !usuario.ativo) {
      return { mensagem: MENSAGEM_RECUPERACAO_NEUTRA };
    }

    const token = gerarTokenAleatorio();
    const tokenHash = gerarHashDoToken(token);
    const expiraEm = adicionarMinutos(
      new Date(),
      configuracao.seguranca.duracaoRecuperacaoMinutos
    );
    const recuperacaoId = await autenticacaoRepository.criarRecuperacaoSenha(
      usuario.id,
      tokenHash,
      expiraEm
    );

    try {
      await emailProvider.enviarRecuperacaoSenha({
        destinatario: usuario.email,
        link: configuracao.frontendUrl + "/?tokenRecuperacao=" + encodeURIComponent(token),
        expiraEm: expiraEm
      });
    } catch (erro) {
      await autenticacaoRepository.invalidarRecuperacao(recuperacaoId);
    }

    return { mensagem: MENSAGEM_RECUPERACAO_NEUTRA };
  }

  async function redefinirSenha(corpo) {
    const dados = validarRedefinicaoDeSenha(corpo);
    const novaSenhaHash = await criarHashDaSenha(dados.novaSenha);
    const tokenHash = gerarHashDoToken(dados.token);
    const redefinida = await autenticacaoRepository.redefinirSenha(
      tokenHash,
      novaSenhaHash
    );

    if (!redefinida) {
      throw new AppError(
        "Token de recuperacao invalido ou expirado",
        400,
        "TOKEN_RECUPERACAO_INVALIDO"
      );
    }

    return { mensagem: "Senha redefinida com sucesso" };
  }

  return {
    cadastrar: cadastrar,
    entrar: entrar,
    sair: sair,
    solicitarRecuperacao: solicitarRecuperacao,
    redefinirSenha: redefinirSenha
  };
}

module.exports = {
  criarAutenticacaoService: criarAutenticacaoService,
  MENSAGEM_RECUPERACAO_NEUTRA: MENSAGEM_RECUPERACAO_NEUTRA
};
