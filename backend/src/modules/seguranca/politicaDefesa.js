const crypto = require("node:crypto");
const net = require("node:net");

const PESOS = Object.freeze({ AUTH_FAILURE: 1, ACCESS_DENIED: 2, ADMIN_ACCESS_DENIED: 4,
  CSRF_FAILURE: 2, INVALID_SESSION: 1, RATE_LIMIT_TRIGGERED: 2, INVALID_UPLOAD: 2,
  INVALID_WEBHOOK: 3, RESOURCE_ENUMERATION: 1, SUSPICIOUS_REQUEST: 1, HONEYPOT_TRIGGERED: 10 });
const CANARIO = "/api/_security/canary";
const ADMIN = /^\/api\/(?:usuarios|permissoes|categorias|disciplinas|concursos|analytics|auditoria)(?:\/|$)/i;
function caminho(req) {
  // Express decodifica parametros: IDs percent-encoded precisam da mesma politica.
  return String(req.originalUrl || req.url || "").split("?")[0].split("/").map(segmento => {
    try { return decodeURIComponent(segmento); } catch { return segmento; }
  }).join("/").toLowerCase().replace(/\/+$/, "");
}
function escopo(req) {
  const rota = caminho(req);
  if (rota === "/api/integracoes/google-drive/webhook") return "webhook";
  if (/^\/api\/autenticacao\/(?:login|cadastro|recuperacao-senha)(?:\/|$)/.test(rota)) return "auth";
  return "app";
}
function critica(req) {
  if (caminho(req) === "/api/integracoes/google-drive/oauth/callback") return true;
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return false;
  const rota = caminho(req);
  return ADMIN.test(rota)
    || (req.method === "DELETE" && /^\/api\/gestao-materiais\/\d+$/.test(rota))
    || (/^\/api\/integracoes\/google-drive(?:\/|$)/.test(rota) && escopo(req) !== "webhook");
}
function classificar(req, codigo, status) {
  if (codigo === "CREDENCIAIS_INVALIDAS") return "AUTH_FAILURE";
  if (codigo === "CSRF_INVALIDO") return "CSRF_FAILURE";
  // /me sem sessao e parte normal da inicializacao/logout da interface.
  if (codigo === "NAO_AUTENTICADO") return caminho(req) === "/api/autenticacao/me" ? null : "INVALID_SESSION";
  if (codigo === "GOOGLE_WEBHOOK_INVALIDO") return "INVALID_WEBHOOK";
  if (codigo.startsWith("GOOGLE_")) return null; // Quota/permissao do provider nao e ataque do usuario.
  if (/^LIMITE_/.test(codigo)) return "RATE_LIMIT_TRIGGERED";
  if (["UPLOAD_INVALIDO", "ARQUIVO_MUITO_GRANDE", "TIPO_ARQUIVO_INVALIDO", "ARQUIVO_INVALIDO", "MIME_INVALIDO"].includes(codigo)) return "INVALID_UPLOAD";
  if (status === 403 && codigo !== "ORIGEM_NAO_PERMITIDA") return ADMIN.test(caminho(req)) ? "ADMIN_ACCESS_DENIED" : "ACCESS_DENIED";
  if (status === 404 && /\/\d+(?:\/|$)/.test(caminho(req))) return "RESOURCE_ENUMERATION";
  if (codigo === "ROTA_NAO_ENCONTRADA" && caminho(req).startsWith("/api/")) return "SUSPICIOUS_REQUEST";
  if (["CORPO_MUITO_GRANDE", "JSON_INVALIDO"].includes(codigo)) return "SUSPICIOUS_REQUEST";
  return null;
}
function criarIdentidade(segredo) {
  if (!/^[a-fA-F0-9]{64}$/.test(segredo || "")) throw new Error("SECURITY_EVIDENCE_KEY ausente ou invalida");
  const chave = crypto.hkdfSync("sha256", Buffer.from(segredo, "hex"), "plantel-security-v1", "evidencia", 32);
  function hash(valor) { return crypto.createHmac("sha256", chave).update(String(valor)).digest("hex"); }
  function preparar(req, tipo, agora) {
    let ip = String(req.ip || req.socket?.remoteAddress || "");
    if (ip.startsWith("::ffff:")) ip = ip.slice(7);
    if (!net.isIP(ip)) ip = "indisponivel";
    const usuarioId = Number.isSafeInteger(req.usuario?.id) ? req.usuario.id : null;
    const sujeito = hash(usuarioId ? "user:" + usuarioId : "ip:" + ip);
    const ua = String(req.headers?.["user-agent"] || "").slice(0, 512);
    const agente = /Firefox/i.test(ua) ? "Firefox" : /Edg/i.test(ua) ? "Edge" : /Chrome/i.test(ua) ? "Chrome" : /Safari/i.test(ua) ? "Safari" : "outro";
    // Nunca copiar caminho arbitrario: segmentos fora do vocabulario sao substituidos.
    const palavras = new Set("api autenticacao login cadastro recuperacao-senha solicitar redefinir logout me csrf usuarios papel ativo permissoes professores minhas disciplinas categorias concursos acervo materiais conteudo download pastas mover substituir lixeira restaurar organizacao classificacao gestao-materiais integracoes google-drive oauth callback sincronizar webhook status analytics auditoria parceiros avisos suporte meu-historico _security canary".split(" "));
    const rota = caminho(req).split("/").slice(0, 10).map(p => palavras.has(p) ? p : p ? ":param" : "").join("/");
    const partesRecurso = /\/(materiais|usuarios|pastas|categorias)\/(\d{1,15})(?:\/|$)/.exec(caminho(req));
    const recurso = partesRecurso ? partesRecurso[1] + ":" + partesRecurso[2] : null;
    return { versao: 1, instante: agora, requestId: /^[a-zA-Z0-9-]{1,64}$/.test(req.id || "") ? req.id : null,
      sujeito, usuarioId, ip, agente, agenteHash: hash(ua), rota,
      metodo: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].includes(req.method) ? req.method : "OUTRO",
      tipo, escopo: escopo(req), recurso };
  }
  function assinar(texto) { return hash(texto); }
  function verificar(texto, assinatura) {
    return /^[a-f0-9]{64}$/.test(assinatura || "") && crypto.timingSafeEqual(Buffer.from(assinar(texto)), Buffer.from(assinatura));
  }
  return { preparar, assinar, verificar, hash };
}
module.exports = { PESOS, CANARIO, caminho, escopo, critica, classificar, criarIdentidade };
