const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");

function nomeSeguro(nome) {
  const limpo = String(nome || "arquivo")
    .replace(/[\r\n]/g, " ")
    .replace(/[\\/:*?"<>|]/g, "-")
    .trim()
    .slice(0, 180);
  return limpo || "arquivo";
}

function disposicao(tipo, nome) {
  const seguro = nomeSeguro(nome);
  const ascii = seguro.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return tipo + "; filename=\"" + ascii + "\"; filename*=UTF-8''" + encodeURIComponent(seguro);
}

function copiarCabecalho(respostaDrive, respostaHttp, nome) {
  const cabecalho = respostaDrive.headers;
  ["content-length", "content-range", "etag", "last-modified"].forEach(function copiar(chave) {
    const valor = cabecalho.get(chave);
    if (valor) {
      respostaHttp.setHeader(chave, valor);
    }
  });
  respostaHttp.setHeader("Accept-Ranges", "bytes");
  respostaHttp.setHeader("Content-Type", nome.mime_type || "application/octet-stream");
  respostaHttp.setHeader("X-Content-Type-Options", "nosniff");
}

function criarAcervoController(service) {
  async function consultar(req, res, next) {
    try {
      const resultado = await service.consultar(req.query);
      res.status(200).json(resultado);
    } catch (erro) {
      next(erro);
    }
  }

  async function enviarArquivo(req, res, next, baixar) {
    try {
      const resultado = await service.obterArquivo(req.params.materialId, req.headers.range);
      const respostaDrive = resultado.resposta;
      copiarCabecalho(respostaDrive, res, resultado.material);
      res.setHeader(
        "Content-Disposition",
        disposicao(baixar ? "attachment" : "inline", resultado.material.nome)
      );
      res.status(respostaDrive.status);
      if (!respostaDrive.body) {
        res.end();
        return;
      }
      await pipeline(Readable.fromWeb(respostaDrive.body), res);
    } catch (erro) {
      if (res.headersSent) {
        res.destroy(erro);
        return;
      }
      if (erro.statusCode === 416 && erro.tamanhoTotal !== null && erro.tamanhoTotal !== undefined) {
        res.setHeader("Content-Range", "bytes */" + erro.tamanhoTotal);
        res.setHeader("Accept-Ranges", "bytes");
      }
      next(erro);
    }
  }

  function visualizar(req, res, next) {
    enviarArquivo(req, res, next, false);
  }

  function baixar(req, res, next) {
    enviarArquivo(req, res, next, true);
  }

  async function classificarPasta(req, res, next) {
    try {
      const resultado = await service.classificarPasta(req.params.categoriaId, req.body, req.usuario.id);
      res.status(200).json(resultado);
    } catch (erro) {
      next(erro);
    }
  }

  async function obterOrganizacao(req, res, next) {
    try {
      res.status(200).json(await service.obterOrganizacao());
    } catch (erro) {
      next(erro);
    }
  }

  async function classificarPastas(req, res, next) {
    try {
      res.status(200).json(await service.classificarPastas(req.body, req.usuario.id));
    } catch (erro) {
      next(erro);
    }
  }

  return {
    consultar: consultar,
    visualizar: visualizar,
    baixar: baixar,
    classificarPasta: classificarPasta,
    obterOrganizacao: obterOrganizacao,
    classificarPastas: classificarPastas
  };
}

module.exports = criarAcervoController;
