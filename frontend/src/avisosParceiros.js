export function combinarAvisosParceiros(avisos, parceiros) {
  const ativos = parceiros.filter(p => p.ativo === true || p.ativo === 1);
  const links = new Set(ativos.map(p => p.link));
  return [
    ...avisos.filter(a => !links.has(a.url)).map(a => ({ ...a, id: `aviso-${a.id}` })),
    ...ativos.map(p => ({
      id: `parceiro-${p.id}`,
      texto: [p.nome, p.descricao, p.desconto, p.cupom ? `Cupom: ${p.cupom}` : ""].filter(Boolean).join(" · "),
      url: p.link
    }))
  ];
}
