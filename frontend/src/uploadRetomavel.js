import {requisitar} from "./api.js";

export function chaveUpload(usuarioId) { return "plantel-upload-pendente:" + usuarioId; }
export function lerUpload(usuarioId) {
  try { return JSON.parse(localStorage.getItem(chaveUpload(usuarioId))) || null; } catch { return null; }
}
export function salvarUpload(usuarioId,estado) {
  try {
    if (estado) localStorage.setItem(chaveUpload(usuarioId),JSON.stringify(estado));
    else localStorage.removeItem(chaveUpload(usuarioId));
  } catch { /* Sem storage, a retomada continua possivel enquanto a tela permanece aberta. */ }
}
function base64(bytes) { return btoa(String.fromCharCode(...bytes)); }
export async function identificarSelecao(arquivo) {
  const inicio = new Uint8Array(await arquivo.slice(0,65536).arrayBuffer());
  const fim = new Uint8Array(await arquivo.slice(Math.max(0,arquivo.size-65536)).arrayBuffer());
  const amostra = new Uint8Array(inicio.length+fim.length);
  amostra.set(inicio); amostra.set(fim,inicio.length);
  return {nome:arquivo.name,tamanho:arquivo.size,modificado:arquivo.lastModified,
    resumo:base64(new Uint8Array(await crypto.subtle.digest("SHA-256",amostra))),assinatura:base64(inicio.slice(0,16))};
}
export async function prepararEnvio(formulario,anterior) {
  const arquivo = formulario.get("arquivo");
  if (!(arquivo instanceof Blob) || arquivo.size < 16) throw new Error("Selecione um PDF ou vídeo válido.");
  const selecao = await identificarSelecao(arquivo);
  if (anterior) {
    if (JSON.stringify(selecao) !== JSON.stringify(anterior.selecao)) throw new Error("Para retomar, selecione o mesmo arquivo original. Ou cancele o envio pendente.");
    return anterior;
  }
  return {id:crypto.randomUUID(),selecao,campos:Object.fromEntries([...formulario.entries()].filter(([k]) => k !== "arquivo")),
    arquivo:{nome:arquivo.name,tamanho:arquivo.size,mime:arquivo.type,assinatura:selecao.assinatura}};
}

// Limite por operacao: nenhuma repeticao cega do upload completo nem nova sessao no retry.
export async function executarEnvio(arquivo,pendente,progresso,{request=requisitar,esperar=ms=>new Promise(r=>setTimeout(r,ms))}={}) {
  const requisicao = request;
  request = (path,opcoes) => requisicao(path,{...opcoes,signal:AbortSignal.timeout(45000)});
  async function tentar(fn) {
    for (let n=0;;n++) {
      try { return await fn(n); } catch (e) {
        const temporario = !e.status || e.status >= 500 || e.status === 429 || ["GOOGLE_DRIVE_OPERACAO_CONCORRENTE","UPLOAD_OFFSET_DIVERGENTE"].includes(e.codigo);
        if (!temporario) throw e;
        if (n >= 2) throw Object.assign(new Error("Envio interrompido. Verifique a conexão e use Retomar envio; o progresso confirmado será preservado."),{codigo:"UPLOAD_INTERROMPIDO",status:e.status});
        await esperar(e.status === 429 ? 60000 : 1000 * 2 ** n);
      }
    }
  }
  let estado = await tentar(() => request("/uploads",{method:"POST",body:JSON.stringify({id:pendente.id,arquivo:pendente.arquivo,campos:pendente.campos})}));
  progresso(estado);
  if (estado.estado === "concluido") return estado;
  estado = await tentar(() => request("/uploads/"+pendente.id,{method:"GET"}));
  let semAvanco = 0;
  while (true) {
    progresso(estado);
    if (estado.estado === "concluido") return estado;
    if (estado.estado === "enviado") break;
    const antes = estado.recebido;
    if (!Number.isSafeInteger(antes) || antes < 0 || antes >= arquivo.size || !Number.isSafeInteger(estado.chunkBytes) || estado.chunkBytes < 1 || estado.chunkBytes > 4*1024*1024) throw new Error("Progresso inválido. Interrompa e consulte o suporte.");
    estado = await tentar(async tentativa => {
      // Depois de resposta perdida, consultar; nunca retransmitir cegamente.
      const atual = tentativa ? await request("/uploads/"+pendente.id,{method:"GET"}) : estado;
      if (["enviado","concluido"].includes(atual.estado)) return atual;
      return request("/uploads/"+pendente.id+"/partes",{method:"PUT",headers:{"Content-Type":"application/octet-stream","X-Upload-Offset":String(atual.recebido)},
        body:arquivo.slice(atual.recebido,Math.min(arquivo.size,atual.recebido+atual.chunkBytes))});
    });
    progresso(estado);
    semAvanco = estado.recebido > antes ? 0 : semAvanco+1;
    if (semAvanco >= 3) throw new Error("O envio não avançou. Verifique a conexão e use Retomar envio.");
  }
  progresso({...estado,estado:"finalizando"});
  return tentar(() => request("/uploads/"+pendente.id+"/finalizar",{method:"POST",body:"{}"}));
}
export function cancelarEnvio(id) { return requisitar("/uploads/"+id,{method:"DELETE"}); }
