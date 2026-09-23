// Somente arquivos versionados do build: nunca interceptar navegação, API ou dados pessoais.
const CACHE_PREFIX = "plantel-assets-";
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const LIMITE_DE_ASSETS = 40;
const ASSET_VERSIONADO = /^\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.(?:js|css|woff2?|png|jpe?g|webp|svg)$/;

self.addEventListener("activate", (evento) => {
  evento.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes.filter((nome) => nome.startsWith(CACHE_PREFIX) && nome !== CACHE_NAME).map((nome) => caches.delete(nome)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (evento) => {
  if (evento.data?.tipo === "ATIVAR_NOVA_VERSAO") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (evento) => {
  const requisicao = evento.request;
  const url = new URL(requisicao.url);
  if (requisicao.method !== "GET" || url.origin !== self.location.origin ||
      !ASSET_VERSIONADO.test(url.pathname) ||
      !["script", "style", "font", "image"].includes(requisicao.destination)) return;

  evento.respondWith((async () => {
    let cache;
    try {
      cache = await caches.open(CACHE_NAME);
      const copia = await cache.match(requisicao);
      if (copia) return copia;
    } catch { /* Cache indisponível: continua pela rede. */ }

    const resposta = await fetch(requisicao);
    if (cache && resposta.ok && resposta.type === "basic") {
      try {
        await cache.put(requisicao, resposta.clone());
        const chaves = await cache.keys();
        await Promise.all(chaves.slice(0, -LIMITE_DE_ASSETS).map((chave) => cache.delete(chave)));
      } catch { /* Quota indisponível: usa a rede. */ }
    }
    return resposta;
  })());
});
