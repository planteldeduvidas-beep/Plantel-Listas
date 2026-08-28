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
import { Alerta, Carregando, Icone, mensagemHumana } from "./ComponentesInterface.jsx";
import { criarUrlDaNavegacao, limparParametrosTemporarios } from "./navegacao.js";

function App() {
  const [tema, definirTema] = useState(function lerTema() {
    return window.localStorage.getItem("plantel-tema") === "claro" ? "claro" : "escuro";
  });
  const [retornoInicial] = useState(function lerRetornoInicial() {
    const parametros = new URLSearchParams(window.location.search);
    const token = parametros.get("tokenRecuperacao");
    const retornoGoogleDrive = parametros.get("googleDrive");
    const retornoPopupOAuth = parametros.get("oauthPopup") === "1";

    if (token || retornoGoogleDrive) {
      window.history.replaceState(
        window.history.state,
        "",
        limparParametrosTemporarios(window.location.pathname, window.location.search)
      );
    }

    return { tokenRecuperacao: token, googleDrive: retornoGoogleDrive, popupOAuth: retornoPopupOAuth };
  });
  const tokenRecuperacao = retornoInicial.tokenRecuperacao;
  const [usuario, definirUsuario] = useState(null);
  const [carregando, definirCarregando] = useState(true);
  const [processando, definirProcessando] = useState(false);
  const [tela, definirTela] = useState(tokenRecuperacao ? "redefinir" : "login");
  const [email, definirEmail] = useState("");
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

  useEffect(function aplicarTema() {
    document.documentElement.dataset.tema = tema;
    window.localStorage.setItem("plantel-tema", tema);
  }, [tema]);

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

  function alternarTema() {
    definirTema(function trocar(atual) { return atual === "escuro" ? "claro" : "escuro"; });
  }

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
      definirUsuario(dados.usuario);
      definirSenha("");
    } catch (falha) {
      mostrarErroDaApi(falha);
    } finally {
      concluirOperacao();
    }
  }

  async function enviarCadastro(evento) {
    evento.preventDefault();
    prepararOperacao();
    try {
      await cadastrar(email, senha);
      definirMensagem("Cadastro concluido. Agora entre com sua conta.");
      definirTela("login");
      definirSenha("");
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
      definirTela("login");
      definirMensagem("Sessao encerrada com seguranca.");
    } catch (falha) {
      mostrarErroDaApi(falha);
    } finally {
      concluirOperacao();
    }
  }

  function trocarTela(novaTela) {
    definirTela(novaTela);
    definirMensagem("");
    definirErro("");
    definirSenha("");
  }

  if (carregando) {
    return <main className="pagina-autenticacao"><Carregando texto="Preparando seu acesso..." /></main>;
  }

  if (usuario) {
    return <PainelAcervo usuario={usuario} aoSair={encerrarSessao} tema={tema} aoAlternarTema={alternarTema} />;
  }

  const configuracoesDaTela = {
    login: { titulo: "Que bom ter você de volta", texto: "Entre para encontrar seus materiais de estudo.", acao: enviarLogin, botao: "Entrar" },
    cadastro: { titulo: "Crie sua conta", texto: "Seu acesso de aluno fica pronto em poucos instantes.", acao: enviarCadastro, botao: "Criar minha conta" },
    recuperar: { titulo: "Recupere seu acesso", texto: "Informe seu e-mail e enviaremos as instruções.", acao: enviarRecuperacao, botao: "Enviar instruções" },
    redefinir: { titulo: "Crie uma nova senha", texto: "Escolha uma senha segura para voltar ao acervo.", acao: enviarRedefinicao, botao: "Salvar nova senha" }
  };
  const configuracaoDaTela = configuracoesDaTela[tela];
  const exibirSenha = tela !== "recuperar";

  return (
    <main className="pagina-autenticacao">
      <button type="button" className="alternar-tema alternar-tema-login" onClick={alternarTema} aria-label={tema === "escuro" ? "Usar modo claro" : "Usar modo escuro"}><Icone nome={tema === "escuro" ? "sol" : "lua"} /><span>{tema === "escuro" ? "Modo claro" : "Modo escuro"}</span></button>
      <section className="apresentacao-autenticacao" aria-label="Plantel Listas">
        <div className="marca-completa"><span className="simbolo-marca">PL</span><span><strong>Plantel Listas</strong><small>Plantel de Dúvidas</small></span></div>
        <div className="chamada-autenticacao"><span className="selo">Seu acervo em um só lugar</span><h2>Encontre.<br />Estude.<br />Avance.</h2><p>Uma biblioteca organizada para alunos, professores e administradores do Plantel de Dúvidas.</p></div>
        <ul className="beneficios-autenticacao"><li><Icone nome="buscar" /><span>Encontre materiais em segundos</span></li><li><Icone nome="acervo" /><span>Acesse em qualquer dispositivo</span></li><li><Icone nome="sucesso" /><span>Conteúdo organizado pelo Plantel</span></li></ul>
      </section>

      <section className="cartao-autenticacao" aria-labelledby="titulo-principal">
        <div className="marca-mobile"><span className="simbolo-marca">PL</span><strong>Plantel Listas</strong></div>
        <span className="marca">Acesso ao acervo</span>
        <h1 id="titulo-principal">{configuracaoDaTela.titulo}</h1>
        <p className="descricao">{configuracaoDaTela.texto}</p>

        <form onSubmit={configuracaoDaTela.acao}>
          {tela !== "redefinir" && (
            <label>
              E-mail
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={function atualizarEmail(evento) { definirEmail(evento.target.value); }}
                required
              />
            </label>
          )}
          {exibirSenha && (
            <label>
              {tela === "redefinir" ? "Nova senha" : "Senha"}
              <input
                type="password"
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
          </nav>
        )}
      </section>
    </main>
  );
}

export default App;

