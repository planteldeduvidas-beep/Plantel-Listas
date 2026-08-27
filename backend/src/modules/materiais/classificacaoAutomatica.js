function normalizar(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const DISCIPLINAS = [
  ["fisica", "Física"],
  ["geografia", "Geografia"],
  ["historia", "História"],
  ["ingles", "Inglês"],
  ["matematica", "Matemática"],
  ["portugues", "Português"],
  ["quimica", "Química"],
  ["biologia", "Biologia"]
];

const CONCURSOS_RAIZ = {
  "afa provas anteriores": "AFA",
  "apmbb barro branco provas anteriores": "APMBB",
  "ason provas anteriores": "ASON",
  "cfn provas anteriores": "CFN",
  "cfo cbmerj provas anteriores": "CFO CBMERJ",
  "cn colegio naval provas anteriores": "Colégio Naval",
  "eags provas anteriores": "EAGS",
  "eam provas anteriores": "EAM",
  "eear provas anteriores": "EEAr",
  "efomm provas anteriores": "EFOMM",
  "en escola naval provas anteriores": "Escola Naval",
  "epcar provas anteriores": "EPCAr",
  "esa provas anteriores": "ESA",
  "esfcex provas anteriores": "ESFCEx",
  "espcex provas anteriores": "EsPCEx",
  "ime provas antigas": "IME",
  "ita provas anteriores": "ITA",
  "sdpm sp provas anteriores": "SDPM-SP"
};

function disciplinasNoNome(nome) {
  const palavras = " " + normalizar(nome) + " ";
  return DISCIPLINAS.filter(function filtrar(item) {
    return palavras.includes(" " + item[0] + " ");
  }).map(function nomeCanonico(item) { return item[1]; });
}

function recomendacaoDaCategoria(categoria, categoriasPorId) {
  const nome = normalizar(categoria.nome);
  const pai = categoriasPorId.get(Number(categoria.categoria_pai_id));
  const avo = pai ? categoriasPorId.get(Number(pai.categoria_pai_id)) : null;
  const bisavo = avo ? categoriasPorId.get(Number(avo.categoria_pai_id)) : null;
  const raiz = !pai;
  const resultado = {};
  const disciplinas = disciplinasNoNome(categoria.nome);

  if (disciplinas.length === 1) {
    resultado.disciplina = { estado: "definida", nome: disciplinas[0], regra: "NOME_DISCIPLINA_INEQUIVOCO" };
  } else if (disciplinas.length > 1) {
    resultado.disciplina = { estado: "nao_se_aplica", nome: null, regra: "PASTA_MULTIDISCIPLINAR" };
  }

  if (raiz && nome === "provas antigas") {
    resultado.disciplina = { estado: "nao_se_aplica", nome: null, regra: "RAIZ_PROVAS_MISTAS" };
    resultado.concurso = { estado: "nao_se_aplica", nome: null, regra: "RAIZ_PROVAS_MISTAS" };
  } else if (raiz && nome === "listas") {
    resultado.concurso = { estado: "nao_se_aplica", nome: null, regra: "RAIZ_LISTAS_POR_DISCIPLINA" };
  } else if (raiz && nome === "professores") {
    resultado.concurso = { estado: "nao_se_aplica", nome: null, regra: "RAIZ_PROFESSORES" };
  } else if (raiz && nome === "planner") {
    resultado.disciplina = { estado: "nao_se_aplica", nome: null, regra: "CONTEUDO_ADMINISTRATIVO" };
    resultado.concurso = { estado: "nao_se_aplica", nome: null, regra: "CONTEUDO_ADMINISTRATIVO" };
  } else if (raiz && nome === "oficina de fisica jp") {
    resultado.disciplina = { estado: "definida", nome: "Física", regra: "OFICINA_FISICA" };
    resultado.concurso = { estado: "nao_se_aplica", nome: null, regra: "OFICINA_POR_DISCIPLINA" };
  }

  if (pai && normalizar(pai.nome) === "provas antigas" && CONCURSOS_RAIZ[nome]) {
    resultado.concurso = { estado: "definida", nome: CONCURSOS_RAIZ[nome], regra: "PASTA_CONCURSO_PROVAS_ANTIGAS" };
  }

  if (pai && avo && bisavo
      && ["publica", "privada"].includes(normalizar(pai.nome))
      && normalizar(avo.nome) === "vestibulares"
      && normalizar(bisavo.nome) === "provas antigas") {
    resultado.concurso = { estado: "definida", nome: categoria.nome.trim(), regra: "INSTITUICAO_VESTIBULAR" };
  }

  if (pai && normalizar(pai.nome) === "listas" && /\bime\b/.test(nome)) {
    resultado.concurso = { estado: "definida", nome: "IME", regra: "LISTA_IME_EXPLICITA" };
  }

  if (pai && normalizar(pai.nome) === "prof jp"
      && ["classicos", "questoes comentadas", "simulados e provas"].includes(nome)) {
    resultado.disciplina = { estado: "definida", nome: "Física", regra: "PASTA_JP_FISICA_CONFIRMADA" };
  }

  if (pai && normalizar(pai.nome) === "professores" && nome === "professores variados") {
    resultado.disciplina = { estado: "nao_se_aplica", nome: null, regra: "PASTA_MULTIDISCIPLINAR_CONFIRMADA" };
  }

  return resultado;
}

async function carregarCatalogo(executor, tabela) {
  const [registros] = await executor.execute("SELECT id,nome FROM " + tabela + " WHERE ativo=1");
  const mapa = new Map();
  registros.forEach(function adicionar(item) { mapa.set(normalizar(item.nome), Number(item.id)); });
  return mapa;
}

async function garantirConcurso(executor, nome, concursos) {
  const chave = normalizar(nome);
  if (concursos.has(chave)) {
    return concursos.get(chave);
  }
  await executor.execute(
    "INSERT INTO concursos (nome,descricao) VALUES (?,?) AS novo ON DUPLICATE KEY UPDATE nome=novo.nome",
    [nome, "Provas e materiais de " + nome + "."]
  );
  const [registros] = await executor.execute("SELECT id FROM concursos WHERE nome=? LIMIT 1", [nome]);
  const id = Number(registros[0].id);
  concursos.set(chave, id);
  return id;
}

async function registrarMudanca(executor, categoria, dimensao, recomendacao, referenciaId) {
  const estadoAtual = categoria[dimensao + "_estado"];
  const idAtual = categoria[dimensao + "_id"] === null ? null : Number(categoria[dimensao + "_id"]);
  if (estadoAtual === recomendacao.estado && idAtual === referenciaId
      && categoria[dimensao + "_origem"] === "automatica"
      && categoria[dimensao + "_regra_codigo"] === recomendacao.regra) {
    return false;
  }
  await executor.execute(
    "INSERT INTO auditoria_classificacao_categorias "
    + "(categoria_id,dimensao,estado_anterior,referencia_anterior_id,estado_novo,referencia_nova_id,origem,regra_codigo) "
    + "VALUES (?,?,?,?,?,?,'automatica',?)",
    [categoria.id, dimensao, estadoAtual, idAtual, recomendacao.estado, referenciaId, recomendacao.regra]
  );
  await executor.execute(
    "UPDATE categorias SET " + dimensao + "_id=?," + dimensao + "_estado=?,"
    + dimensao + "_origem='automatica'," + dimensao + "_regra_codigo=?,classificacao_origem='automatica' WHERE id=?",
    [referenciaId, recomendacao.estado, recomendacao.regra, categoria.id]
  );
  categoria[dimensao + "_id"] = referenciaId;
  categoria[dimensao + "_estado"] = recomendacao.estado;
  categoria[dimensao + "_origem"] = "automatica";
  categoria[dimensao + "_regra_codigo"] = recomendacao.regra;
  return true;
}

async function aplicarClassificacaoAutomatica(executor) {
  await executor.execute(
    "INSERT INTO disciplinas (nome,descricao) VALUES ('Biologia','Conteudos de Biologia.') AS novo "
    + "ON DUPLICATE KEY UPDATE nome=novo.nome"
  );
  const [categorias] = await executor.execute(
    "SELECT id,nome,categoria_pai_id,disciplina_id,disciplina_estado,disciplina_origem,"
    + "disciplina_regra_codigo,concurso_id,concurso_estado,concurso_origem,concurso_regra_codigo "
    + "FROM categorias WHERE ativo=1 ORDER BY id"
  );
  const categoriasPorId = new Map();
  categorias.forEach(function adicionar(item) { categoriasPorId.set(Number(item.id), item); });
  const disciplinas = await carregarCatalogo(executor, "disciplinas");
  const concursos = await carregarCatalogo(executor, "concursos");
  let alteradas = 0;

  for (const categoria of categorias) {
    const recomendacoes = recomendacaoDaCategoria(categoria, categoriasPorId);
    for (const dimensao of ["disciplina", "concurso"]) {
      if (categoria[dimensao + "_origem"] === "manual") {
        continue;
      }
      if (!recomendacoes[dimensao] && categoria[dimensao + "_origem"] === "automatica") {
        recomendacoes[dimensao] = {
          estado: "herdar",
          nome: null,
          regra: "REGRA_NAO_APLICAVEL_APOS_MUDANCA"
        };
      }
      if (!recomendacoes[dimensao]) {
        continue;
      }
      let referenciaId = null;
      if (recomendacoes[dimensao].estado === "definida") {
        if (dimensao === "disciplina") {
          referenciaId = disciplinas.get(normalizar(recomendacoes[dimensao].nome));
        } else {
          referenciaId = await garantirConcurso(executor, recomendacoes[dimensao].nome, concursos);
        }
      }
      if (referenciaId || recomendacoes[dimensao].estado !== "definida") {
        alteradas += await registrarMudanca(executor, categoria, dimensao, recomendacoes[dimensao], referenciaId) ? 1 : 0;
      }
    }
  }
  return { pastasAlteradas: alteradas };
}

module.exports = {
  aplicarClassificacaoAutomatica: aplicarClassificacaoAutomatica,
  normalizar: normalizar,
  recomendacaoDaCategoria: recomendacaoDaCategoria
};
