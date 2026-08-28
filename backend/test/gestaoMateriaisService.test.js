const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const AppError = require("../src/shared/errors/AppError");
const criarService = require("../src/modules/materiais/gestaoMateriaisService");
const { ESCOPO_GESTAO } = require("../src/shared/providers/googleDriveProvider");

function material() {
  return { id: 1, nome: "original.pdf", driveFileId: "driveOriginal", driveParentFileId: "drivePasta", categoriaId: 10, categoriaDriveId: "drivePasta", estado: "disponivel", versao: 1 };
}

function categoria(id) {
  return { id: id, nome: "Pasta", drivePastaId: "drivePasta" + id, ativo: true };
}

function criarDependencias(alteracoes) {
  const chamadas = [];
  const repository = {
    buscarMaterial: async function buscar() { return material(); },
    buscarCategoria: async function buscar(id) { return categoria(id); },
    professorPodeAcessarCategoria: async function permitir() { return true; },
    atualizarMaterial: async function atualizar() { return material(); },
    criarMaterial: async function criar() { return material(); }
  };
  const provider = {
    escopo: ESCOPO_GESTAO,
    pastaRaizId: "driveRaiz",
    obterItem: async function obter(token, id) { return id.startsWith("drivePasta") ? { id: id, mimeType: "application/vnd.google-apps.folder", parents: ["driveRaiz"], trashed: false } : { id: id, mimeType: "application/pdf", parents: ["drivePasta"], trashed: false }; },
    verificarDescendenteDaRaiz: async function verificar() { return true; },
    criarArquivo: async function criar() { chamadas.push("criar"); return { id: "driveNovo", name: "novo.pdf", mimeType: "application/pdf", size: "20" }; },
    excluirArquivo: async function excluir() { chamadas.push("excluir"); },
    renomearArquivo: async function renomear(token, id, nome) { chamadas.push("renomear:" + nome); },
    moverArquivo: async function mover() { chamadas.push("mover"); }
  };
  const integracaoService = {
    obterRefreshTokenParaUso: async function token() { return "token-interno"; },
    registrarFalhaDeAutorizacao: async function registrar() { chamadas.push("autorizacao-invalida"); }
  };
  Object.assign(repository, alteracoes && alteracoes.repository);
  Object.assign(provider, alteracoes && alteracoes.provider);
  Object.assign(integracaoService, alteracoes && alteracoes.integracaoService);
  return {
    chamadas: chamadas,
    service: criarService({
      repository: repository,
      provider: provider,
      integracaoService: integracaoService,
      configuracao: { seguranca: { tamanhoMaximoPdfBytes: 1000, tamanhoMaximoVideoBytes: 1000 } }
    })
  };
}

test("compensa renomeacao no Drive quando o MySQL falha", async function testarCompensacaoEdicao() {
  const dependencias = criarDependencias({ repository: { atualizarMaterial: async function falhar() { throw new Error("falha banco"); } } });
  await assert.rejects(dependencias.service.editar({ id: 2, papel: "admin" }, 1, { nome: "novo.pdf", versao: 1 }), /falha banco/);
  assert.deepEqual(dependencias.chamadas, ["renomear:novo.pdf", "renomear:original.pdf"]);
});

test("nao altera MySQL quando o Google falha ou expira", async function testarFalhaGoogle() {
  let atualizacoes = 0;
  const dependencias = criarDependencias({
    repository: { atualizarMaterial: async function atualizar() { atualizacoes += 1; return material(); } },
    provider: { renomearArquivo: async function falhar() { throw new AppError("Google indisponivel", 503, "GOOGLE_DRIVE_INDISPONIVEL"); } }
  });
  await assert.rejects(dependencias.service.editar({ id: 2, papel: "admin" }, 1, { nome: "novo.pdf", versao: 1 }), function validar(erro) { return erro.codigo === "GOOGLE_DRIVE_INDISPONIVEL"; });
  assert.equal(atualizacoes, 0);
});

test("marca autorizacao revogada sem registrar token", async function testarTokenRevogado() {
  const dependencias = criarDependencias({
    provider: { renomearArquivo: async function falhar() { throw new AppError("Autorizacao invalida", 503, "GOOGLE_AUTORIZACAO_INVALIDA"); } }
  });
  await assert.rejects(dependencias.service.editar({ id: 2, papel: "admin" }, 1, { nome: "novo.pdf", versao: 1 }), function validar(erro) { return erro.codigo === "GOOGLE_AUTORIZACAO_INVALIDA"; });
  assert.deepEqual(dependencias.chamadas, ["autorizacao-invalida"]);
  assert.equal(JSON.stringify(dependencias.chamadas).includes("token-interno"), false);
});

test("remove upload temporario e apaga arquivo novo quando o MySQL falha", async function testarCompensacaoUpload() {
  const caminho = path.join(os.tmpdir(), "plantel-listas-compensacao-" + process.pid + ".pdf");
  const conteudo = Buffer.from("%PDF-1.7\nseguro");
  await fs.writeFile(caminho, conteudo);
  const dependencias = criarDependencias({ repository: { criarMaterial: async function falhar() { throw new Error("falha banco"); } } });
  await assert.rejects(dependencias.service.adicionar({ id: 2, papel: "admin" }, { categoriaId: "10" }, { path: caminho, size: conteudo.length, originalname: "novo.pdf", mimetype: "application/pdf" }), /falha banco/);
  assert.deepEqual(dependencias.chamadas, ["criar", "excluir"]);
  await assert.rejects(fs.stat(caminho), function removido(erro) { return erro.code === "ENOENT"; });
});
