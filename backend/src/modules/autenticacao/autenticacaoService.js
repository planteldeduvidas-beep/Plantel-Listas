const AppError = require("../../shared/errors/AppError");
const {
  gerarTokenAleatorio,
  gerarHashDoToken,
  adicionarHoras,
  adicionarMinutos
} = require("../../shared/utils/tokens");
const {
  validarCredenciais,
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
    if (!dependencias.cadastroPendenteService) throw new AppError("Cadastro temporariamente indisponível",503,"CADASTRO_INDISPONIVEL");
    return dependencias.cadastroPendenteService.cadastrar(corpo);
  }

  async function entrar(corpo) {
    const dados = validarCredenciais(corpo);
    const usuario = await usuarioRepository.buscarPorEmail(dados.email);
    if (!usuario && dependencias.cadastroPendenteService) {
      const pendente = await dependencias.cadastroPendenteService.buscar(dados.email);
      if (await verificarSenhaSemEnumerar(pendente?.senhaHash,dados.senha)) throw new AppError("Confirme seu e-mail antes de entrar. Você pode reenviar o link.",403,"EMAIL_NAO_CONFIRMADO");
    }
    const senhaCorreta = await verificarSenhaSemEnumerar(
      usuario ? usuario.senhaHash : null,
      dados.senha
    );

    if (!usuario || !senhaCorreta || !usuario.ativo || usuario.excluidoEm) {
      throw new AppError(
        MENSAGEM_CREDENCIAIS_INVALIDAS,
        401,
        "CREDENCIAIS_INVALIDAS"
      );
    }

    if (usuario.cadastroEmailPendente) {
      throw new AppError("Confirme seu e-mail antes de entrar. Confira também Spam ou Lixo eletrônico; você pode reenviar o link ou corrigir o endereço.", 403, "EMAIL_NAO_CONFIRMADO");
    }
    const token = gerarTokenAleatorio();
    const tokenHash = gerarHashDoToken(token);
    const expiraEm = adicionarHoras(
      new Date(),
      configuracao.seguranca.duracaoSessaoHoras
    );
    const sessaoCriada = typeof autenticacaoRepository.criarSessaoSeCredencialAtual === "function"
      ? await autenticacaoRepository.criarSessaoSeCredencialAtual(usuario.id,usuario.senhaHash,usuario.versaoSessao,tokenHash,expiraEm)
      : (await autenticacaoRepository.criarSessao(usuario.id,tokenHash,expiraEm),true);
    if(!sessaoCriada){
      throw new AppError(MENSAGEM_CREDENCIAIS_INVALIDAS,401,"CREDENCIAIS_INVALIDAS");
    }

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
      expiraEm,
      { email: usuario.email, versaoSessao: usuario.versaoSessao }
    );

    // A conta pode ter mudado entre a leitura do email e a trava no banco.
    if (!recuperacaoId) return { mensagem: MENSAGEM_RECUPERACAO_NEUTRA };

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
