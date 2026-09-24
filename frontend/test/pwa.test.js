import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { runInNewContext } from "node:vm";

const base = new URL("../", import.meta.url);

test("manifest declara instalação standalone e ícones PNG existentes", () => {
  const manifest = JSON.parse(readFileSync(new URL("public/manifest.webmanifest", base), "utf8"));
  assert.equal(manifest.name, "Plantel Listas");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  for (const icone of manifest.icons) {
    assert.match(icone.src, /^\/icons\/plantel-[\w-]+\.png$/);
    assert.ok(statSync(new URL(`public${icone.src}`, base)).size > 0);
  }
});

test("service worker guarda apenas asset versionado e ignora API, páginas e arquivos privados", async () => {
  const ouvintes = new Map();
  const guardados = new Map();
  let chamadasRede = 0;
  let ativacoes = 0;
  const resposta = { ok: true, type: "basic", clone() { return this; } };
  const ambiente = {
    URL,
    caches: {
      async open() {
        return {
          async match(pedido) { return guardados.get(pedido.url); },
          async put(pedido, valor) { guardados.set(pedido.url, valor); },
          async keys() { return [...guardados.keys()].map((url) => ({ url })); },
          async delete(pedido) { return guardados.delete(pedido.url); }
        };
      },
      async keys() { return []; }
    },
    fetch: async () => { chamadasRede += 1; return resposta; },
    self: {
      location: { origin: "https://plantellistas.planteldeduvidas.com.br" },
      addEventListener(tipo, ouvinte) { ouvintes.set(tipo, ouvinte); },
      clients: { claim: async () => {} },
      skipWaiting() { ativacoes += 1; }
    }
  };
  runInNewContext(readFileSync(new URL("public/sw.js", base), "utf8"), ambiente);

  async function consultar(caminho, destino = "script") {
    let interceptado;
    const request = { url: new URL(caminho, ambiente.self.location.origin).href, method: "GET", destination: destino };
    ouvintes.get("fetch")({ request, respondWith(promessa) { interceptado = promessa; } });
    if (interceptado) await interceptado;
    return Boolean(interceptado);
  }

  assert.equal(await consultar("/api/sessao"), false);
  assert.equal(await consultar("/api/usuarios"), false);
  assert.equal(await consultar("/login", "document"), false);
  assert.equal(await consultar("/privacidade", "document"), false);
  assert.equal(await consultar("/materiais/arquivo.pdf", "image"), false);
  assert.equal(await consultar("/assets/index-semhash.js"), false);
  assert.equal(await consultar("/assets/index-BUJ6XOSt.js"), true);
  assert.equal(await consultar("/assets/index-BUJ6XOSt.js"), true);
  assert.equal(chamadasRede, 1);
  assert.deepEqual([...guardados.keys()], ["https://plantellistas.planteldeduvidas.com.br/assets/index-BUJ6XOSt.js"]);

  for (let indice = 0; indice < 41; indice += 1) {
    assert.equal(await consultar(`/assets/parte-${String(indice).padStart(8, "0")}.js`), true);
  }
  assert.equal(guardados.size, 40);
  assert.equal(guardados.has("https://plantellistas.planteldeduvidas.com.br/assets/index-BUJ6XOSt.js"), false);

  ouvintes.get("message")({ data: { tipo: "ATIVAR_NOVA_VERSAO" } });
  assert.equal(ativacoes, 1);
});

test("convite de instalacao e capturado antes da interface e informa cada plataforma", () => {
  const registro = readFileSync(new URL("src/pwa/registro.js", base), "utf8");
  const instalacao = readFileSync(new URL("src/pwa/InstalacaoPwa.jsx", base), "utf8");

  assert.match(registro, /window\.addEventListener\("beforeinstallprompt"/);
  assert.match(registro, /observarConviteDeInstalacao/);
  assert.match(registro, /consumirConviteDeInstalacao/);
  assert.match(instalacao, /escolha\.outcome === "accepted"/);
  assert.match(instalacao, /const pararRegistro = registrarPwa/);
  assert.match(instalacao, /Safari/);
  assert.match(instalacao, /Chrome\/Edge/);
  assert.match(instalacao, /Abrindo confirma/);
});

test("convite recebido antes da interface continua disponivel ate ser consumido", async () => {
  const janelaAnterior = globalThis.window;
  const ouvintes = new Map();
  globalThis.window = {
    addEventListener(tipo, ouvinte) { ouvintes.set(tipo, ouvinte); }
  };

  try {
    const registro = await import(`../src/pwa/registro.js?teste=${Date.now()}`);
    const convite = { preventDefault() { this.prevenido = true; } };
    ouvintes.get("beforeinstallprompt")(convite);
    assert.equal(convite.prevenido, true);

    const observados = [];
    const parar = registro.observarConviteDeInstalacao((evento) => observados.push(evento));
    assert.equal(observados[0], convite);

    registro.consumirConviteDeInstalacao();
    assert.equal(observados[1], null);
    parar();
  } finally {
    globalThis.window = janelaAnterior;
  }
});

test("orientacao de instalacao permanece acessivel sem convite nativo, inclusive no Firefox", () => {
  const instalacao = readFileSync(new URL("src/pwa/InstalacaoPwa.jsx", base), "utf8");
  assert.match(instalacao, /if \(!convite\) \{\s*definirResultadoDaInstalacao\(instrucaoManual\(ios\)\)/);
  assert.match(instalacao, /if \(instalado \|\| dispensado\) return null/);
  assert.match(instalacao, /"Instalar Plantel Listas"/);
  assert.doesNotMatch(instalacao, /"Como instalar"/);
  assert.match(instalacao, /No Firefox para Android/);
  assert.match(instalacao, /No Firefox para Windows/);
});
