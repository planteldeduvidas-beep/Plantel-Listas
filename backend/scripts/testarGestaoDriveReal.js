const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const request = require("supertest");
const pino = require("pino");
const criarAplicacao = require("../src/app");
const { obterConfiguracao } = require("../src/shared/config/ambiente");
const { criarPool } = require("../src/shared/database/conexao");
const { criarEmailProviderFake } = require("../src/shared/providers/emailProvider");
const { criarGoogleDriveProvider, ESCOPO_GESTAO } = require("../src/shared/providers/googleDriveProvider");
const criarIntegracaoRepository = require("../src/modules/materiais/integracaoGoogleDriveRepository");
const criarIntegracaoService = require("../src/modules/materiais/integracaoGoogleDriveService");
const { criarHashDaSenha } = require("../src/modules/autenticacao/senha");

const MIME_PASTA = "application/vnd.google-apps.folder";

async function executar() {
  const configuracao = obterConfiguracao();
  const logger = pino({ level: "silent" });
  const pool = criarPool(configuracao.banco);
  const provider = criarGoogleDriveProvider(configuracao.googleDrive);
  const integracaoRepository = criarIntegracaoRepository(pool);
  const integracaoService = criarIntegracaoService({
    repository: integracaoRepository,
    provider: provider,
    configuracao: configuracao,
    logger: logger,
    agendarTarefa: function ignorar() {}
  });
  const refreshToken = await integracaoService.obterRefreshTokenParaUso();
  assert.equal(provider.escopo, ESCOPO_GESTAO);

  const identificador = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const prefixo = "TESTE_FASE_6_" + identificador;
  const senha = "Teste-Fase-6-" + crypto.randomUUID();
  const usuarios = [];
  const categorias = [];
  const arquivosCriados = new Set();
  let pastaTemporaria = null;
  const resultados = [];

  async function criarUsuario(papel) {
    const email = papel + "." + identificador + "@teste-fase-6.local";
    const [resultado] = await pool.execute(
      "INSERT INTO usuarios (email,senha_hash,papel) VALUES (?,?,?)",
      [email, await criarHashDaSenha(senha), papel]
    );
    const usuario = { id: Number(resultado.insertId), email: email, papel: papel };
    usuarios.push(usuario);
    return usuario;
  }

  async function criarCategoria(nome, drivePastaId, categoriaPaiId) {
    const [resultado] = await pool.execute(
      "INSERT INTO categorias (nome,categoria_pai_id,drive_pasta_id,ativo) VALUES (?,?,?,1)",
      [nome, categoriaPaiId || null, drivePastaId]
    );
    const id = Number(resultado.insertId);
    categorias.push(id);
    return id;
  }

  async function autenticar(aplicacao, usuario) {
    const agente = request.agent(aplicacao);
    const csrf = (await agente.get("/api/autenticacao/csrf")).body.csrfToken;
    const login = await agente.post("/api/autenticacao/login")
      .set("X-CSRF-Token", csrf)
      .send({ email: usuario.email, senha: senha });
    assert.equal(login.status, 200);
    return { agente: agente, csrf: csrf };
  }

  async function excluirDriveSeCriado(id) {
    if (!id) return;
    await provider.excluirArquivo(refreshToken, id).catch(function ignorar() {});
  }

  try {
    const raiz = await provider.obterItem(refreshToken, provider.pastaRaizId);
    assert.equal(raiz.mimeType, MIME_PASTA);
    assert.equal(raiz.trashed, false);

    pastaTemporaria = await provider.criarPasta(refreshToken, prefixo, provider.pastaRaizId);
    assert.equal(pastaTemporaria.name, prefixo);
    assert.equal(await provider.verificarDescendenteDaRaiz(refreshToken, pastaTemporaria), true);
    resultados.push("pasta temporaria criada dentro da raiz");

    const pastaOrigem = await provider.criarPasta(refreshToken, "ORIGEM", pastaTemporaria.id);
    const pastaDestino = await provider.criarPasta(refreshToken, "DESTINO", pastaTemporaria.id);
    const pastaProibida = await provider.criarPasta(refreshToken, "SEM_ACESSO_PROFESSOR", pastaTemporaria.id);
    assert.equal(await provider.verificarDescendenteDaRaiz(refreshToken, pastaOrigem), true);
    assert.equal(await provider.verificarDescendenteDaRaiz(refreshToken, pastaDestino), true);
    assert.equal(await provider.verificarDescendenteDaRaiz(refreshToken, pastaProibida), true);

    const categoriaRaiz = await criarCategoria(prefixo, pastaTemporaria.id, null);
    const categoriaOrigem = await criarCategoria(prefixo + " ORIGEM", pastaOrigem.id, categoriaRaiz);
    const categoriaDestino = await criarCategoria(prefixo + " DESTINO", pastaDestino.id, categoriaRaiz);
    const categoriaProibida = await criarCategoria(prefixo + " SEM ACESSO", pastaProibida.id, categoriaRaiz);

    const admin = await criarUsuario("admin");
    const professor = await criarUsuario("professor");
    const aluno = await criarUsuario("aluno");
    await pool.execute(
      "INSERT INTO permissoes_professor_categoria (professor_id,categoria_id,concedida_por_usuario_id) VALUES (?,?,?),(?,?,?)",
      [professor.id, categoriaOrigem, admin.id, professor.id, categoriaDestino, admin.id]
    );

    const aplicacao = criarAplicacao(configuracao, logger, {
      pool: pool,
      emailProvider: criarEmailProviderFake(),
      googleDriveProvider: provider,
      agendarTarefaGoogleDrive: function ignorar() {},
      agendarTarefaGoogleDriveChanges: function ignorar() {}
    });
    const sessaoAdmin = await autenticar(aplicacao, admin);
    const sessaoProfessor = await autenticar(aplicacao, professor);
    const sessaoAluno = await autenticar(aplicacao, aluno);
    const pdf = Buffer.from("%PDF-1.7\nTeste controlado da Fase 6\n", "utf8");
    const video = Buffer.concat([Buffer.alloc(4), Buffer.from("ftyp"), Buffer.from("Teste controlado da Fase 6")]);

    const uploadProfessor = await sessaoProfessor.agente.post("/api/gestao-materiais")
      .set("X-CSRF-Token", sessaoProfessor.csrf)
      .field("categoriaId", String(categoriaOrigem))
      .attach("arquivo", pdf, { filename: prefixo + ".pdf", contentType: "application/pdf" });
    assert.equal(uploadProfessor.status, 201, JSON.stringify(uploadProfessor.body));
    const materialId = uploadProfessor.body.id;
    let versao = uploadProfessor.body.versao;
    let [registros] = await pool.execute("SELECT drive_file_id FROM materiais WHERE id=?", [materialId]);
    let driveFileId = registros[0].drive_file_id;
    arquivosCriados.add(driveFileId);
    assert.equal(await provider.verificarDescendenteDaRaiz(refreshToken, await provider.obterItem(refreshToken, driveFileId)), true);
    resultados.push("upload real de professor autorizado");

    const uploadProibido = await sessaoProfessor.agente.post("/api/gestao-materiais")
      .set("X-CSRF-Token", sessaoProfessor.csrf)
      .field("categoriaId", String(categoriaProibida))
      .attach("arquivo", pdf, { filename: "proibido.pdf", contentType: "application/pdf" });
    assert.equal(uploadProibido.status, 403);
    const uploadAluno = await sessaoAluno.agente.post("/api/gestao-materiais")
      .set("X-CSRF-Token", sessaoAluno.csrf)
      .field("categoriaId", String(categoriaOrigem))
      .attach("arquivo", pdf, { filename: "aluno.pdf", contentType: "application/pdf" });
    assert.equal(uploadAluno.status, 403);
    resultados.push("barreiras de professor e aluno");

    const paiExternoId = raiz.parents && raiz.parents[0];
    assert.equal(Boolean(paiExternoId), true, "A pasta raiz configurada precisa possuir pai para o teste de barreira");
    const categoriaExterna = await criarCategoria(prefixo + " FORA DA RAIZ", paiExternoId, null);
    const uploadFora = await sessaoAdmin.agente.post("/api/gestao-materiais")
      .set("X-CSRF-Token", sessaoAdmin.csrf)
      .field("categoriaId", String(categoriaExterna))
      .attach("arquivo", pdf, { filename: "fora-da-raiz.pdf", contentType: "application/pdf" });
    assert.equal(uploadFora.status, 403);
    assert.equal(uploadFora.body.erro.codigo, "PASTA_FORA_DA_RAIZ");
    resultados.push("barreira real da pasta raiz sem escrita externa");

    const editado = await sessaoProfessor.agente.patch("/api/gestao-materiais/" + materialId)
      .set("X-CSRF-Token", sessaoProfessor.csrf)
      .send({ nome: prefixo + "_RENOMEADO.pdf", versao: versao });
    assert.equal(editado.status, 200, JSON.stringify(editado.body));
    versao = editado.body.versao;
    assert.equal((await provider.obterItem(refreshToken, driveFileId)).name, prefixo + "_RENOMEADO.pdf");
    resultados.push("edicao e renomeacao reais");

    const moverProibido = await sessaoProfessor.agente.patch("/api/gestao-materiais/" + materialId + "/mover")
      .set("X-CSRF-Token", sessaoProfessor.csrf)
      .send({ categoriaId: categoriaProibida, versao: versao });
    assert.equal(moverProibido.status, 403);
    const movido = await sessaoProfessor.agente.patch("/api/gestao-materiais/" + materialId + "/mover")
      .set("X-CSRF-Token", sessaoProfessor.csrf)
      .send({ categoriaId: categoriaDestino, versao: versao });
    assert.equal(movido.status, 200, JSON.stringify(movido.body));
    versao = movido.body.versao;
    assert.deepEqual((await provider.obterItem(refreshToken, driveFileId)).parents, [pastaDestino.id]);
    resultados.push("movimentacao real e destino proibido");

    const substituido = await sessaoProfessor.agente.post("/api/gestao-materiais/" + materialId + "/substituir")
      .set("X-CSRF-Token", sessaoProfessor.csrf)
      .field("versao", String(versao))
      .attach("arquivo", video, { filename: prefixo + ".mp4", contentType: "video/mp4" });
    assert.equal(substituido.status, 200, JSON.stringify(substituido.body));
    assert.equal(substituido.body.id, materialId);
    assert.equal(substituido.body.tipo, "video");
    versao = substituido.body.versao;
    const driveAnterior = driveFileId;
    [registros] = await pool.execute("SELECT drive_file_id FROM materiais WHERE id=?", [materialId]);
    driveFileId = registros[0].drive_file_id;
    arquivosCriados.add(driveFileId);
    assert.notEqual(driveFileId, driveAnterior);
    assert.equal((await provider.obterItem(refreshToken, driveAnterior)).trashed, true);
    resultados.push("substituicao real preservando materialId");

    const lixo = await sessaoProfessor.agente.post("/api/gestao-materiais/" + materialId + "/lixeira")
      .set("X-CSRF-Token", sessaoProfessor.csrf)
      .send({ versao: versao });
    assert.equal(lixo.status, 200);
    versao += 1;
    assert.equal((await provider.obterItem(refreshToken, driveFileId)).trashed, true);
    assert.equal((await sessaoAluno.agente.get("/api/acervo/materiais/" + materialId + "/download")).status, 404);
    resultados.push("lixeira real e bloqueio de leitura");

    const restaurado = await sessaoAdmin.agente.post("/api/gestao-materiais/" + materialId + "/restaurar")
      .set("X-CSRF-Token", sessaoAdmin.csrf)
      .send({ versao: versao });
    assert.equal(restaurado.status, 200);
    versao += 1;
    assert.equal((await provider.obterItem(refreshToken, driveFileId)).trashed, false);
    resultados.push("restauracao real por admin");

    const lixoFinal = await sessaoAdmin.agente.post("/api/gestao-materiais/" + materialId + "/lixeira")
      .set("X-CSRF-Token", sessaoAdmin.csrf)
      .send({ versao: versao });
    assert.equal(lixoFinal.status, 200);
    versao += 1;
    const exclusao = await sessaoAdmin.agente.delete("/api/gestao-materiais/" + materialId)
      .set("X-CSRF-Token", sessaoAdmin.csrf)
      .send({ versao: versao });
    assert.equal(exclusao.status, 200, JSON.stringify(exclusao.body));
    const [estadoFinal] = await pool.execute("SELECT estado_gestao,disponivel FROM materiais WHERE id=?", [materialId]);
    assert.equal(estadoFinal[0].estado_gestao, "excluido");
    assert.equal(Number(estadoFinal[0].disponivel), 0);
    resultados.push("exclusao definitiva real somente do arquivo temporario");

  } finally {
    const idsUsuarios = usuarios.map(function id(item) { return item.id; });
    if (idsUsuarios.length) {
      const marcadores = idsUsuarios.map(function marcador() { return "?"; }).join(",");
      await pool.execute("DELETE FROM auditoria_materiais WHERE usuario_id IN (" + marcadores + ")", idsUsuarios).catch(function ignorar() {});
    }
    if (categorias.length) {
      const marcadores = categorias.map(function marcador() { return "?"; }).join(",");
      await pool.execute("DELETE FROM materiais WHERE categoria_id IN (" + marcadores + ")", categorias).catch(function ignorar() {});
    }
    if (idsUsuarios.length) {
      const marcadores = idsUsuarios.map(function marcador() { return "?"; }).join(",");
      await pool.execute("DELETE FROM permissoes_professor_categoria WHERE professor_id IN (" + marcadores + ") OR concedida_por_usuario_id IN (" + marcadores + ")", idsUsuarios.concat(idsUsuarios)).catch(function ignorar() {});
      await pool.execute("DELETE FROM sessoes WHERE usuario_id IN (" + marcadores + ")", idsUsuarios).catch(function ignorar() {});
    }
    for (let indice = categorias.length - 1; indice >= 0; indice -= 1) {
      await pool.execute("DELETE FROM categorias WHERE id=?", [categorias[indice]]).catch(function ignorar() {});
    }
    if (idsUsuarios.length) {
      const marcadores = idsUsuarios.map(function marcador() { return "?"; }).join(",");
      await pool.execute("DELETE FROM usuarios WHERE id IN (" + marcadores + ")", idsUsuarios).catch(function ignorar() {});
    }
    for (const arquivoId of arquivosCriados) {
      await excluirDriveSeCriado(arquivoId);
    }
    await excluirDriveSeCriado(pastaTemporaria && pastaTemporaria.id);

    const [usuariosRestantes] = await pool.execute(
      "SELECT COUNT(*) AS total FROM usuarios WHERE email LIKE ?",
      ["%." + identificador + "@teste-fase-6.local"]
    );
    const [categoriasRestantes] = await pool.execute(
      "SELECT COUNT(*) AS total FROM categorias WHERE nome LIKE ?",
      [prefixo + "%"]
    );
    assert.equal(Number(usuariosRestantes[0].total), 0);
    assert.equal(Number(categoriasRestantes[0].total), 0);
    await pool.end();
  }

  process.stdout.write("Teste real controlado aprovado:\n- " + resultados.join("\n- ")
    + "\n- limpeza dos registros e itens temporarios confirmada\n");
}

executar().catch(function falhar(erro) {
  process.stderr.write("Teste real controlado falhou: " + String(erro.codigo || erro.message || "ERRO") + "\n");
  process.exitCode = 1;
});
