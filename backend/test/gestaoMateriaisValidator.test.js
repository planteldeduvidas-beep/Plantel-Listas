const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { identificarArquivo } = require("../src/modules/materiais/gestaoMateriaisValidator");

test("recusa arquivo acima do limite configurado sem carrega-lo em memoria", async function testarLimite() {
  const caminho = path.join(os.tmpdir(), "plantel-listas-limite-" + process.pid + ".pdf");
  await fs.writeFile(caminho, Buffer.from("%PDF-1.7\npequeno"));
  try {
    await assert.rejects(
      identificarArquivo({
        path: caminho,
        size: 11,
        originalname: "grande.pdf",
        mimetype: "application/pdf"
      }, {
        seguranca: { tamanhoMaximoPdfBytes: 10, tamanhoMaximoVideoBytes: 20 }
      }),
      function validar(erro) {
        assert.equal(erro.statusCode, 413);
        assert.equal(erro.codigo, "ARQUIVO_MUITO_GRANDE");
        return true;
      }
    );
  } finally {
    await fs.unlink(caminho).catch(function ignorar() {});
  }
});
