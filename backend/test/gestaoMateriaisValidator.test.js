const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { identificarArquivo, validarUpload } = require("../src/modules/materiais/gestaoMateriaisValidator");

test("upload mobile aceita MIME generico e M4V sem aceitar assinatura ou MIME conflitante", async function () {
  const diretorio = await fs.mkdtemp(path.join(os.tmpdir(), "plantel-upload-mobile-"));
  const caminho = path.join(diretorio,"arquivo");
  const config = {seguranca:{tamanhoMaximoPdfBytes:1000,tamanhoMaximoVideoBytes:1000}};
  const arquivo = {path:caminho,size:20,originalname:"lista.pdf",mimetype:"application/octet-stream"};
  try {
    await fs.writeFile(caminho,"%PDF-1.7\nconteudo");
    const upload = await validarUpload({categoriaId:"10",nome:"Minha lista"},arquivo,config);
    assert.equal(upload.nome,"Minha lista.pdf");
    assert.equal(upload.mimeType,"application/pdf");
    await assert.rejects(validarUpload({categoriaId:"10",nome:"lista.exe"},arquivo,config),{codigo:"EXTENSAO_INCOMPATIVEL"});
    await assert.rejects(identificarArquivo({...arquivo,mimetype:"image/png"},config),{codigo:"TIPO_ARQUIVO_INVALIDO"});
    await fs.writeFile(caminho,"arquivo falso");
    await assert.rejects(identificarArquivo(arquivo,config),{codigo:"TIPO_ARQUIVO_INVALIDO"});
    await fs.writeFile(caminho,Buffer.concat([Buffer.alloc(4),Buffer.from("ftypM4V "),Buffer.alloc(8)]));
    assert.equal((await identificarArquivo({...arquivo,originalname:"aula.m4v",mimetype:"video/x-m4v"},config)).tipo,"video");
  } finally { await fs.rm(diretorio,{recursive:true,force:true}); }
});

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
