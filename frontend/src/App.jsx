import { useEffect, useState } from "react";
import {
  cadastrar,
  entrar,
  sair,
  obterUsuarioAtual,
  solicitarRecuperacao,
  redefinirSenha
} from "./api.js";

function App() {
  const [tokenRecuperacao] = useState(function lerTokenRecuperacao() {
    const parametros = new URLSearchParams(window.location.search);
    const token = parametros.get("tokenRecuperacao");

    if (token) {
      window.history.replaceState({}, "", window.location.pathname);
    }

    return token;
  });
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

  function prepararOperacao() {
    definirProcessando(true);
    definirMensagem("");
    definirErro("");
  }

  function concluirOperacao() {
    definirProcessando(false);
  }

  function mostrarErroDaApi(falha) {
    definirErro(falha.message || "Nao foi possivel concluir a operacao");
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
    return <main className="pagina-autenticacao"><p>Verificando sessao...</p></main>;
  }

  if (usuario) {
    return (
      <main className="pagina-autenticacao">
        <section className="cartao-autenticacao" aria-labelledby="titulo-conta">
          <span className="marca">Plantel Listas</span>
          <h1 id="titulo-conta">Sessao autenticada</h1>
          <dl className="dados-conta">
            <div><dt>Email</dt><dd>{usuario.email}</dd></div>
            <div><dt>Papel</dt><dd>{usuario.papel}</dd></div>
          </dl>
          {erro && <p className="aviso erro" role="alert">{erro}</p>}
          <button type="button" onClick={encerrarSessao} disabled={processando}>
            {processando ? "Encerrando..." : "Sair"}
          </button>
        </section>
      </main>
    );
  }

  const configuracoesDaTela = {
    login: { titulo: "Entrar", acao: enviarLogin, botao: "Entrar" },
    cadastro: { titulo: "Criar conta de aluno", acao: enviarCadastro, botao: "Cadastrar" },
    recuperar: { titulo: "Esqueci minha senha", acao: enviarRecuperacao, botao: "Enviar instrucoes" },
    redefinir: { titulo: "Definir nova senha", acao: enviarRedefinicao, botao: "Redefinir senha" }
  };
  const configuracaoDaTela = configuracoesDaTela[tela];
  const exibirSenha = tela !== "recuperar";

  return (
    <main className="pagina-autenticacao">
      <section className="cartao-autenticacao" aria-labelledby="titulo-principal">
        <span className="marca">Plantel Listas</span>
        <h1 id="titulo-principal">{configuracaoDaTela.titulo}</h1>
        <p className="descricao">Acesso seguro ao acervo do Plantel de Duvidas.</p>

        <form onSubmit={configuracaoDaTela.acao}>
          {tela !== "redefinir" && (
            <label>
              Email
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

          {mensagem && <p className="aviso sucesso" role="status">{mensagem}</p>}
          {erro && <p className="aviso erro" role="alert">{erro}</p>}
          <button type="submit" disabled={processando}>
            {processando ? "Processando..." : configuracaoDaTela.botao}
          </button>
        </form>

        {tela !== "redefinir" && (
          <nav className="acoes-secundarias" aria-label="Outras opcoes de acesso">
            {tela !== "login" && <button type="button" onClick={function abrirLogin() { trocarTela("login"); }}>Entrar</button>}
            {tela !== "cadastro" && <button type="button" onClick={function abrirCadastro() { trocarTela("cadastro"); }}>Criar conta</button>}
            {tela !== "recuperar" && <button type="button" onClick={function abrirRecuperacao() { trocarTela("recuperar"); }}>Esqueci a senha</button>}
          </nav>
        )}
      </section>
    </main>
  );
}

export default App;

