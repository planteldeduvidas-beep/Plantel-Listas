import React, { useEffect, useState } from "react";
import {
  cadastrar,
  entrar,
  sair,
  obterUsuarioAtual,
  solicitarRecuperacao,
  redefinirSenha
} from "./api.js";
import PainelAcervo from "./PainelAcervo.jsx";
import {CaixaAceiteTermos,aceiteAtual} from './TermosAluno.jsx';
import AvisoEmail from "./AvisoEmail.jsx";
import AjudaConta from "./AjudaConta.jsx";
import { ConfirmacaoEmail } from "./EmailConta.jsx";
import { AguardarConfirmacaoCadastro, ConfirmacaoCadastro } from "./CadastroEmail.jsx";
import PaginaInstitucional from "./PaginaInstitucional.jsx";
import { Alerta, AlternadorTema, CampoSenha, Carregando, Icone, aplicarTema, lerTemaSalvo, mensagemHumana } from "./ComponentesInterface.jsx";
import { criarUrlDaNavegacao, limparParametrosTemporarios, obterDocumentoPublico } from "./navegacao.js";

function Aplicacao() {
  const [temaInicial] = useState(lerTemaSalvo);
  const [retornoInicial] = useState(function lerRetornoInicial() {
    const parametros = new URLSearchParams(window.location.search);
    const token = parametros.get("tokenRecuperacao");
    const tokenEmail = parametros.get("tokenEmail");
    const cadastroEmail = parametros.get("cadastroEmail") === "1";
    const retornoGoogleDrive = parametros.get("googleDrive");
    const retornoPopupOAuth = parametros.get("oauthPopup") === "1";

    if (token || tokenEmail || retornoGoogleDrive) {
      window.history.replaceState(
        window.history.state,
        "",
        limparParametrosTemporarios(window.location.pathname, window.location.search)
      );
    }

    return { tokenRecuperacao: token, tokenEmail, cadastroEmail, googleDrive: retornoGoogleDrive, popupOAuth: retornoPopupOAuth };
  });
  const tokenRecuperacao = retornoInicial.tokenRecuperacao;
  const [emailConcluido, definirEmailConcluido] = useState(false);
  const [usuario, definirUsuario] = useState(null);
  const [entradaRecente, definirEntradaRecente] = useState(false);
  const [carregando, definirCarregando] = useState(true);
  const [processando, definirProcessando] = useState(false);
  const [tela, definirTela] = useState(tokenRecuperacao ? "redefinir" : "login");
  const [email, definirEmail] = useState("");
  const [nome, definirNome] = useState("");
  const [termosAceitos, definirTermosAceitos] = useState(false);
  const [senha, definirSenha] = useState("");
  const [mensagem, definirMensagem] = useState("");
  const [erro, definirErro] = useState("");

  useEffect(function carregarUsuario() {
    obterUsuarioAtual()
      .then(function receberUsuario(dados) {
        definirUsuario(dados.usuario);
      })
      .catch(function ignorarAusenciaDeSessao() {})
      .finally(function concluirCarregamento() {
        definirCarregando(false);
      });
  }, []);

  useEffect(function aplicarTemaInicial() { aplicarTema(temaInicial); }, [temaInicial]);

  useEffect(function atualizarContaAoVoltar() {
    if (!usuario) return;
    let ativo = true;
    async function atualizar() {
      if (document.visibilityState === "hidden") return;
      try {
        const dados = await obterUsuarioAtual();
        if (ativo) definirUsuario(atual => atual?.id === dados.usuario.id ? dados.usuario : atual);
      } catch (falha) {
        if (ativo && falha.status === 401) {
          definirUsuario(null);
          definirTela(atual => atual === "redefinir" ? atual : "login");
          definirMensagem("Sua sessão terminou. Entre novamente para continuar.");
        }
      }
    }
    window.addEventListener("focus", atualizar);
    document.addEventListener("visibilitychange", atualizar);
    return () => { ativo = false; window.removeEventListener("focus", atualizar); document.removeEventListener("visibilitychange", atualizar); };
  }, [usuario?.id]);

  useEffect(function concluirOAuthEmJanelaSeparada() {
    if (!retornoInicial.googleDrive || !window.opener || window.opener.closed) {
      return;
    }
    window.opener.postMessage({ tipo: "plantel-google-drive-conectado" }, window.location.origin);
    window.close();
  }, [retornoInicial]);

  useEffect(function acompanharRetornoDoGoogleDrive() {
    function receberRetorno(evento) {
      if (evento.origin !== window.location.origin || !evento.data || evento.data.tipo !== "plantel-google-drive-conectado") {
        return;
      }
      window.location.replace(criarUrlDaNavegacao(window.location.pathname, "drive"));
    }
    window.addEventListener("message", receberRetorno);
    return function removerAcompanhamento() {
      window.removeEventListener("message", receberRetorno);
    };
  }, []);

  function prepararOperacao() {
    definirProcessando(true);
    definirMensagem("");
    definirErro("");
  }

  function concluirOperacao() {
    definirProcessando(false);
  }

  function mostrarErroDaApi(falha) {
    definirErro(mensagemHumana(falha));
  }

  async function enviarLogin(evento) {
    evento.preventDefault();
    prepararOperacao();
    try {
      const dados = await entrar(email, senha);
      definirEntradaRecente(true);
      definirUsuario(dados.usuario);
      definirSenha("");
    } catch (falha) {
      if (falha.codigo === "EMAIL_NAO_CONFIRMADO") { definirTela("confirmarCadastro"); definirSenha(""); }
      mostrarErroDaApi(falha);
    } finally {
      concluirOperacao();
    }
  }

  async function enviarCadastro(evento) {
    evento.preventDefault();
    prepararOperacao();
    try {
      const dados = await cadastrar(nome, email, senha, aceiteAtual(termosAceitos));
      definirMensagem(dados.mensagem || "Cadastro concluído. Agora entre com sua conta.");
      definirTela(dados.confirmacaoPendente ? "confirmarCadastro" : "login");
      definirSenha("");
      definirNome("");
      definirTermosAceitos(false);
    } catch (falha) {
      mostrarErroDaApi(falha);
    } finally {
      concluirOperacao();
    }
  }

  async function enviarRecuperacao(evento) {
    evento.preventDefault();
    prepararOperacao();
    try {
      const dados = await solicitarRecuperacao(email);
      definirMensagem(dados.mensagem);
    } catch (falha) {
      mostrarErroDaApi(falha);
    } finally {
      concluirOperacao();
    }
  }

  async function enviarRedefinicao(evento) {
    evento.preventDefault();
    prepararOperacao();
    try {
      const dados = await redefinirSenha(tokenRecuperacao, senha);
      definirMensagem(dados.mensagem + ". Entre novamente.");
      definirTela("login");
      definirSenha("");
      definirUsuario(null);
      definirEntradaRecente(false);
    } catch (falha) {
      mostrarErroDaApi(falha);
    } finally {
      concluirOperacao();
    }
  }

  async function encerrarSessao() {
    prepararOperacao();
    try {
      await sair();
      window.history.replaceState({}, "", window.location.pathname);
      definirUsuario(null);
      definirEntradaRecente(false);
      definirTela("login");
      definirMensagem("Sessao encerrada com seguranca.");
    } catch (falha) {
      mostrarErroDaApi(falha);
    } finally {
      concluirOperacao();
    }
  }

  function trocarTela(novaTela) {
    definirTermosAceitos(false);
    definirTela(novaTela);
    definirMensagem("");
    definirErro("");
    definirSenha("");
  }

  if (carregando) {
    return <main className="pagina-autenticacao"><Carregando texto="Preparando seu acesso..." /></main>;
  }

  if (retornoInicial.cadastroEmail && retornoInicial.tokenEmail && !emailConcluido) return <ConfirmacaoCadastro token={retornoInicial.tokenEmail} aoVoltar={endereco => { definirEmailConcluido(true); if (endereco) definirEmail(endereco); definirTela("login"); }} />;
  if (!usuario && tela === "confirmarCadastro") return <AguardarConfirmacaoCadastro emailAtual={email} mensagemInicial={mensagem || erro} aoVoltar={() => trocarTela("login")} />;

  if (usuario && tela !== "redefinir") {
    if (retornoInicial.tokenEmail && !emailConcluido) return <ConfirmacaoEmail usuario={usuario} token={retornoInicial.tokenEmail} aoCancelar={() => definirEmailConcluido(true)} aoConcluir={dados => { definirUsuario(dados.usuario); definirEmailConcluido(true); }} />;
    return <PainelAcervo usuario={usuario} aoSair={encerrarSessao} mostrarBoasVindas={entradaRecente} />;
  }

  const configuracoesDaTela = {
    login: { titulo: "Que bom ter você de volta", texto: "Entre para encontrar seus materiais de estudo.", acao: enviarLogin, botao: "Entrar" },
    cadastro: { titulo: "Crie sua conta", texto: "Seu acesso de aluno fica pronto em poucos instantes.", acao: enviarCadastro, botao: "Criar minha conta" },
    recuperar: { titulo: "Recupere seu acesso", texto: "Informe seu e-mail e enviaremos as instruções.", acao: enviarRecuperacao, botao: "Enviar instruções" },
    redefinir: { titulo: "Crie uma nova senha", texto: "Escolha uma senha segura para voltar aos seus materiais.", acao: enviarRedefinicao, botao: "Salvar nova senha" }
  };
  const configuracaoDaTela = configuracoesDaTela[tela];
  const exibirSenha = tela !== "recuperar";

  return (
    <main className="pagina-autenticacao">
      <AlternadorTema classe="alternar-tema-login" />
      <section className="apresentacao-autenticacao" aria-label="Plantel Listas">
        <div className="marca-completa"><img className="simbolo-marca" src="/plantel-logo.png" alt="" /><span><strong>Plantel Listas</strong><small>Plantel de Dúvidas</small></span></div>
        <div className="chamada-autenticacao"><span className="selo">Seus materiais em um só lugar</span><h2>Encontre.<br />Estude.<br />Avance.</h2><p>Uma biblioteca organizada para alunos, professores e administradores do Plantel de Dúvidas.</p></div>
        <ul className="beneficios-autenticacao"><li><Icone nome="buscar" /><span>Encontre materiais em segundos</span></li><li><Icone nome="acervo" /><span>Acesse em qualquer dispositivo</span></li><li><Icone nome="sucesso" /><span>Conteúdo organizado pelo Plantel</span></li></ul>
      </section>

      <section className="cartao-autenticacao" aria-labelledby={tela === "ajudaConta" ? "titulo-ajuda-conta" : "titulo-principal"}>
        <div className="marca-mobile"><img className="simbolo-marca" src="/plantel-logo.png" alt="" /><strong>Plantel Listas</strong></div>
        <span className="marca">Acesso à biblioteca</span>
        {tela === "ajudaConta" ? <AjudaConta aoVoltar={() => trocarTela("login")} /> : <>
        <h1 id="titulo-principal">{configuracaoDaTela.titulo}</h1>
        <p className="descricao">{configuracaoDaTela.texto}</p>
        {retornoInicial.tokenEmail && !emailConcluido && <p>Para confirmar seu e-mail, entre com a conta que solicitou o link. Se está trocando o endereço, use o e-mail antigo para entrar.</p>}
        {(tela === "recuperar" || tela === "cadastro") && <AvisoEmail />}

        <form onSubmit={configuracaoDaTela.acao}>
          {tela === "cadastro" && (
            <label>
              Nome e sobrenome
              <input
                type="text"
                autoComplete="name"
                placeholder="Ex.: Ana Silva"
                pattern={"\\s*\\S+(?:\\s+\\S+)+\\s*"}
                title="Informe seu nome e pelo menos um sobrenome. Exemplo: Ana Silva."
                minLength="2"
                maxLength="120"
                value={nome}
                onChange={function atualizarNome(evento) { definirNome(evento.target.value); }}
                required
              />
              <small>Informe seu nome e pelo menos um sobrenome.</small>
            </label>
          )}
          {tela !== "redefinir" && (
            <label>
              E-mail
              <input
                type="email"
                autoComplete="email"
                placeholder={tela === "cadastro" ? "seunome@provedor.com" : undefined}
                value={email}
                onChange={function atualizarEmail(evento) { definirEmail(evento.target.value); }}
                required
              />
              {tela === "cadastro" && <small>Use um e-mail ao qual você tenha acesso. Gmail, Outlook, Hotmail e outros provedores são aceitos.</small>}
            </label>
          )}
          {exibirSenha && (
            <label>
              {tela === "redefinir" ? "Nova senha" : "Senha"}
              <CampoSenha
                minLength="12"
                maxLength="128"
                autoComplete={tela === "login" ? "current-password" : "new-password"}
                value={senha}
                onChange={function atualizarSenha(evento) { definirSenha(evento.target.value); }}
                required
              />
              {tela !== "login" && <small>Use entre 12 e 128 caracteres.</small>}
            </label>
          )}

          {tela === 'cadastro' && <CaixaAceiteTermos marcado={termosAceitos} aoAlterar={definirTermosAceitos} />}
          {mensagem && <Alerta tipo="sucesso">{mensagem}</Alerta>}
          {erro && <Alerta tipo="erro">{erro}</Alerta>}
          <button type="submit" className="botao-principal botao-largo" disabled={processando}>
            {processando ? "Aguarde..." : configuracaoDaTela.botao}
          </button>
        </form>

        {tela !== "redefinir" && (
          <nav className="acoes-secundarias" aria-label="Outras opcoes de acesso">
            {tela !== "login" && <button type="button" onClick={function abrirLogin() { trocarTela("login"); }}>Já tenho conta</button>}
            {tela !== "cadastro" && <button type="button" onClick={function abrirCadastro() { trocarTela("cadastro"); }}>Criar conta</button>}
            {tela !== "recuperar" && <button type="button" onClick={function abrirRecuperacao() { trocarTela("recuperar"); }}>Esqueci a senha</button>}
            <button type="button" onClick={() => trocarTela("ajudaConta")}>Problemas com sua conta?</button>
          </nav>
        )}
        </>}
        <nav className="links-institucionais-autenticacao" aria-label="Informações legais">
          <a href="/privacidade">Política de Privacidade</a>
          <a href="/termos">Termos de Uso</a>
        </nav>
      </section>
    </main>
  );
}

function App() {
  const documentoPublico = obterDocumentoPublico(window.location.pathname);
  return documentoPublico
    ? <PaginaInstitucional documento={documentoPublico} />
    : <Aplicacao />;
}

export default App;

