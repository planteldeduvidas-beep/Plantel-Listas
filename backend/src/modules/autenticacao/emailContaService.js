const AppError = require("../../shared/errors/AppError");
const { exigirObjeto, validarCamposPermitidos, normalizarEmail, validarSenha } = require("./autenticacaoValidator");
const { verificarSenhaSemEnumerar } = require("./senha");
const { gerarTokenAleatorio, gerarHashDoToken, adicionarMinutos } = require("../../shared/utils/tokens");
const criarUsuarioPublico = require("../usuarios/usuarioPublico");
const { serializarErroSeguro } = require("../../shared/config/logger");

function criarEmailContaService({ repository, usuarioRepository, emailProvider, configuracao, logger }) {
  async function obterAviso(usuario) {
    try {
      return { ...usuario, emailPrecisaRevisao: await repository.precisaRevisao(usuario.id, usuario.email) };
    } catch (erro) {
      // Um lembrete nunca pode impedir o login ou a continuidade da sessao.
      logger.warn({ err: serializarErroSeguro(erro), usuarioId: usuario.id }, "Falha ao consultar lembrete de email");
      return { ...usuario, emailPrecisaRevisao: false };
    }
  }

  async function solicitar(usuarioAutenticado, corpo) {
    exigirObjeto(corpo);
    validarCamposPermitidos(corpo, ["email", "senha"]);
    const email = normalizarEmail(corpo.email);
    const senha = validarSenha(corpo.senha);
    const usuario = await usuarioRepository.buscarPorId(usuarioAutenticado.id);
    if (!usuario?.ativo || !await verificarSenhaSemEnumerar(usuario.senhaHash, senha)) {
      throw new AppError("Confira sua senha atual para continuar.", 401, "SENHA_ATUAL_INVALIDA");
    }
    const existente = await usuarioRepository.buscarPorEmail(email);
    if (existente && existente.id !== usuario.id) {
      throw new AppError("Já existe uma conta cadastrada com este e-mail. Informe outro endereço.", 409, "EMAIL_JA_CADASTRADO");
    }
    return enviar(usuario, email);
  }

  async function enviar(usuario, email) {
    const token = gerarTokenAleatorio();
    const id = await repository.criar(usuario, email, gerarHashDoToken(token), adicionarMinutos(new Date(), 60));
    try {
      await emailProvider.enviarConfirmacaoEmail({ destinatario: email, alteracao: email !== usuario.email,
        link: configuracao.frontendUrl + "/?tokenEmail=" + encodeURIComponent(token) });
    } catch (erro) {
      await repository.cancelar(id).catch(falha => logger.warn({ err: serializarErroSeguro(falha), usuarioId: usuario.id }, "Falha ao cancelar confirmacao de email"));
      logger.warn({ err: serializarErroSeguro(erro), usuarioId: usuario.id }, "Falha no envio de confirmacao de email");
      throw new AppError("Não conseguimos enviar o e-mail agora. Seu endereço atual continua válido. Tente novamente mais tarde.", 503, "ENVIO_EMAIL_INDISPONIVEL");
    }
    return { mensagem: "Enviamos um link para o endereço informado. Confira a caixa de entrada, Spam ou Lixo eletrônico e Promoções, se houver. O link vale por 1 hora. Seu e-mail só muda depois da confirmação." };
  }

  async function confirmar(usuario, corpo) {
    exigirObjeto(corpo);
    validarCamposPermitidos(corpo, ["token"]);
    if (typeof corpo.token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(corpo.token)) {
      throw new AppError("Link de confirmação inválido. Solicite um novo link na sua conta.", 400, "CONFIRMACAO_EMAIL_INVALIDA");
    }
    return { usuario: criarUsuarioPublico(await repository.confirmar(usuario.id, gerarHashDoToken(corpo.token))), mensagem: "E-mail confirmado. Use o endereço mostrado na sua conta para entrar e receber nossas mensagens." };
  }
  // Chamado apenas pelo cadastro do servidor, com a conta recem-criada.
  return { solicitar, confirmar, obterAviso, enviarNoCadastro: usuario => enviar(usuario, usuario.email) };
}

module.exports = criarEmailContaService;
