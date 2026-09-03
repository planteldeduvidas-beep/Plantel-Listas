const crypto = require("node:crypto");
const pino = require("pino");
const request = require("supertest");
const criarAplicacao = require("../src/app");
const { obterConfiguracao } = require("../src/shared/config/ambiente");
const { criarPool, verificarConexaoComBanco } = require("../src/shared/database/conexao");
const { criarHashDaSenha } = require("../src/modules/autenticacao/senha");
const { criarEmailProviderFake } = require("../src/shared/providers/emailProvider");

const AMOSTRAS = 30;
const CONCORRENCIA = 5;

function percentil95(valores) {
  const ordenados = valores.slice().sort(function ordenar(a, b) { return a - b; });
  return ordenados[Math.max(0, Math.ceil(ordenados.length * 0.95) - 1)];
}

async function executarEmLotes(tarefa) {
  const tempos = [];
  let erros = 0;
  for (let inicio = 0; inicio < AMOSTRAS; inicio += CONCORRENCIA) {
    const tamanho = Math.min(CONCORRENCIA, AMOSTRAS - inicio);
    const lote = Array.from({ length: tamanho }, async function executar() {
      const comeco = performance.now();
      const resposta = await tarefa();
      tempos.push(performance.now() - comeco);
      if (resposta.statusCode !== 200) {
        erros += 1;
      }
    });
    await Promise.all(lote);
  }
  return {
    requests: AMOSTRAS,
    concorrencia: CONCORRENCIA,
    mediaMs: Number((tempos.reduce(function somar(total, valor) { return total + valor; }, 0) / tempos.length).toFixed(2)),
    p95Ms: Number(percentil95(tempos).toFixed(2)),
    erros: erros
  };
}

async function autenticar(agente, email, senha) {
  const csrf = await agente.get("/api/autenticacao/csrf");
  const login = await agente.post("/api/autenticacao/login")
    .set("X-CSRF-Token", csrf.body.csrfToken)
    .send({ email: email, senha: senha });
  if (login.statusCode !== 200) {
    throw new Error("Falha ao autenticar fixture temporaria de QA");
  }
}

async function executar() {
  const configuracaoBase = obterConfiguracao();
  const hostLocal = ["127.0.0.1", "localhost", "::1"].includes(configuracaoBase.banco.host);
  if (configuracaoBase.ambiente === "production" || !hostLocal) {
    throw new Error("Carga recusada: execute somente contra MySQL local fora de producao");
  }

  const configuracao = Object.assign({}, configuracaoBase, {
    ambiente: "test",
    nivelDeLog: "silent",
    googleDrive: Object.assign({}, configuracaoBase.googleDrive, {
      clientId: "",
      clientSecret: "",
      pastaRaizId: "",
      redirectUri: "",
      refreshToken: "",
      webhookUrl: ""
    })
  });
  const pool = criarPool(configuracao.banco);
  const sufixo = crypto.randomUUID();
  const senha = "QaLocal!" + sufixo;
  const emails = ["qa9-admin-" + sufixo + "@example.invalid", "qa9-aluno-" + sufixo + "@example.invalid"];

  try {
    await verificarConexaoComBanco(pool);
    const senhaHash = await criarHashDaSenha(senha);
    await pool.execute(
      "INSERT INTO usuarios (nome, email, senha_hash, papel) VALUES (?, ?, ?, ?), (?, ?, ?, ?)",
      ["QA 9 Admin", emails[0], senhaHash, "admin", "QA 9 Aluno", emails[1], senhaHash, "aluno"]
    );

    const app = criarAplicacao(configuracao, pino({ level: "silent" }), {
      pool: pool,
      emailProvider: criarEmailProviderFake()
    });
    const admin = request.agent(app);
    const aluno = request.agent(app);
    await autenticar(admin, emails[0], senha);
    await autenticar(aluno, emails[1], senha);

    const [categorias] = await pool.execute("SELECT id FROM categorias WHERE ativo = 1 ORDER BY id LIMIT 1");
    const [disciplinas] = await pool.execute("SELECT id FROM disciplinas WHERE ativo = 1 ORDER BY id LIMIT 1");
    const categoriaId = categorias[0] ? Number(categorias[0].id) : null;
    const disciplinaId = disciplinas[0] ? Number(disciplinas[0].id) : null;
    const cenarios = [
      ["raiz_e_contagem_recursiva", function requisitar() { return aluno.get("/api/acervo?pagina=1&limite=24"); }],
      ["pasta", function requisitar() { return aluno.get("/api/acervo?categoriaId=" + (categoriaId || 1) + "&pagina=1&limite=24"); }],
      ["busca", function requisitar() { return aluno.get("/api/acervo?busca=a&pagina=1&limite=24"); }],
      ["filtros", function requisitar() { return aluno.get("/api/acervo?tipo=pdf" + (disciplinaId ? "&disciplinaId=" + disciplinaId : "") + "&pagina=1&limite=24"); }],
      ["paginacao", function requisitar() { return aluno.get("/api/acervo?pagina=2&limite=24&ordenar=nome_asc"); }],
      ["usuarios", function requisitar() { return admin.get("/api/usuarios?pagina=1&limite=30"); }],
      ["analytics", function requisitar() { return admin.get("/api/analytics?periodo=30"); }],
      ["auditoria", function requisitar() { return admin.get("/api/auditoria?pagina=1&limite=30"); }],
      ["historico_pessoal", function requisitar() { return aluno.get("/api/meu-historico?pagina=1&limite=20"); }]
    ];

    const resultados = {};
    for (const [nome, tarefa] of cenarios) {
      await tarefa();
      resultados[nome] = await executarEmLotes(tarefa);
    }
    const [contagens] = await pool.execute(
      "SELECT (SELECT COUNT(*) FROM materiais WHERE disponivel = 1) AS materiais, "
      + "(SELECT COUNT(*) FROM categorias WHERE ativo = 1) AS pastas"
    );
    process.stdout.write(JSON.stringify({
      ambiente: "MySQL local + aplicacao em processo",
      referencia: {
        materiaisDisponiveis: Number(contagens[0].materiais),
        pastasAtivas: Number(contagens[0].pastas)
      },
      totalRequestsMedidas: cenarios.length * AMOSTRAS,
      resultados: resultados
    }, null, 2) + "\n");
  } finally {
    await pool.execute("DELETE FROM usuarios WHERE email IN (?, ?)", emails).catch(function ignorar() {});
    await pool.end();
  }
}

executar().catch(function falhar(erro) {
  process.stderr.write("QA de carga falhou: " + erro.message + "\n");
  process.exitCode = 1;
});
