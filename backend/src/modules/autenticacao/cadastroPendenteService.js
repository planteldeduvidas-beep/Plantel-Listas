const AppError = require("../../shared/errors/AppError");
const {validarCadastro,exigirObjeto,validarCamposPermitidos,normalizarEmail,validarSenha} = require("./autenticacaoValidator");
const {criarHashDaSenha,verificarSenhaSemEnumerar} = require("./senha");
const {gerarTokenAleatorio,gerarHashDoToken} = require("../../shared/utils/tokens");
const {serializarErroSeguro} = require("../../shared/config/logger");
function criarCadastroPendenteService({repository,usuarioRepository,emailProvider,configuracao,logger}) {
  async function enviar(p,email) {
    const token = gerarTokenAleatorio(), hash = gerarHashDoToken(token);
    await repository.preparar(p,email,hash);
    try { await emailProvider.enviarConfirmacaoEmail({destinatario:email,alteracao:false,link:configuracao.frontendUrl+"/?tokenEmail="+encodeURIComponent(token)+"&cadastroEmail=1"}); }
    catch(e) {
      await repository.cancelar(hash).catch(f=>logger.warn({err:serializarErroSeguro(f)},"Falha ao cancelar token do cadastro"));
      logger.warn({err:serializarErroSeguro(e)},"Falha ao enviar confirmacao do cadastro");
      throw new AppError("Não conseguimos enviar agora. Seu cadastro pendente foi salvo. Aguarde um minuto e tente reenviar.",503,"ENVIO_EMAIL_INDISPONIVEL");
    }
    return {mensagem:"Enviamos o link. Confira a caixa de entrada, Spam ou Lixo eletrônico e Promoções. O link vale por 1 hora; apenas o mais recente funciona."};
  }
  async function cadastrar(corpo) {
    exigirObjeto(corpo);
    const {aceiteTermos,faixaEtaria,...cadastro}=corpo;
    const dados=validarCadastro(cadastro);
    require('./termosService').validarAceite(aceiteTermos);
    dados.faixaEtaria=require('./faixaEtariaService').validarFaixaEtaria(faixaEtaria);
    dados.aceiteTermos=aceiteTermos;
    const p=await repository.criar(dados,await criarHashDaSenha(dados.senha));
    let confirmacaoEmailEnviada=false;
    try {await enviar(p,p.email);confirmacaoEmailEnviada=true;} catch(e) { if(e.codigo!=="ENVIO_EMAIL_INDISPONIVEL" && e.code!=="ENVIO_EMAIL_INDISPONIVEL") throw e; }
    return {confirmacaoPendente:true,confirmacaoEmailEnviada,mensagem:confirmacaoEmailEnviada?"Cadastro pendente salvo. Confirme seu e-mail antes de entrar. Confira também Spam ou Lixo eletrônico e Promoções.":"Cadastro pendente salvo. Não conseguimos enviar o e-mail agora. Aguarde um minuto e reenvie o link."};
  }
  async function solicitar(corpo) {
    exigirObjeto(corpo);validarCamposPermitidos(corpo,["emailAtual","email","senha"]);
    const atual=normalizarEmail(corpo.emailAtual), email=normalizarEmail(corpo.email||atual), senha=validarSenha(corpo.senha);
    const p=await repository.buscar(atual);
    if(!await verificarSenhaSemEnumerar(p?.senhaHash,senha)) throw new AppError("Confira o e-mail cadastrado e sua senha.",401,"CREDENCIAIS_INVALIDAS");
    if(await usuarioRepository.buscarPorEmail(email)) throw new AppError("Já existe uma conta com este e-mail.",409,"EMAIL_JA_CADASTRADO");
    return enviar(p,email);
  }
  async function confirmar(corpo) {
    exigirObjeto(corpo);validarCamposPermitidos(corpo,["token"]);
    if(typeof corpo.token!=="string"||!/^[A-Za-z0-9_-]{43}$/.test(corpo.token)) throw new AppError("Link inválido. Solicite um novo link.",400,"CONFIRMACAO_EMAIL_INVALIDA");
    const usuario=await repository.confirmar(gerarHashDoToken(corpo.token));
    return {email:usuario.email,mensagem:"E-mail confirmado! Agora você pode entrar com seu e-mail e senha."};
  }
  return {cadastrar,solicitar,confirmar,buscar:repository.buscar};
}
module.exports=criarCadastroPendenteService;
