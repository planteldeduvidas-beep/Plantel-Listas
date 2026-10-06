const comuns = [
  { pergunta: "Não recebi o e-mail de confirmação, recuperação ou a resposta do suporte. Onde conferir?", resposta: "Em qualquer provedor, confira a caixa de entrada, Spam ou Lixo eletrônico e a aba Promoções, se houver. Isso vale para confirmação e troca de e-mail, recuperação de senha e respostas do suporte. Se reconhecer uma mensagem legítima do Plantel, marque como Não é spam. Confira se informou o endereço correto e aguarde alguns minutos. Para confirmar ou trocar seu e-mail, envie novamente pela sua conta se necessário; somente o link mais recente vale. Nunca compartilhe sua senha, códigos ou links de acesso." },
  { pergunta: "Meu e-mail está errado ou quero trocá-lo. Como faço?", resposta: "Toque em Atualizar meu e-mail nesta página. Se o endereço ainda não foi confirmado, também aparece Atualizar ou confirmar e-mail na parte inferior do menu; após a confirmação, esse botão desaparece. Informe o novo endereço e sua senha atual. Abra o link recebido, entre na mesma conta do Plantel usando o endereço antigo e confirme. Seu e-mail antigo continua válido até concluir; seu histórico e permissões são mantidos. Se esqueceu a senha, primeiro use Esqueci a senha com o endereço atual. Se também perdeu acesso a esse e-mail, peça ajuda ao Suporte; nunca envie senhas." },
  { pergunta: "Como encontro, abro ou baixo um material?", resposta: "Na Biblioteca, navegue pelas pastas ou digite parte do nome na busca. Use Filtros para refinar os resultados. No material, toque em Abrir para ver o PDF ou assistir ao vídeo, ou em Baixar para guardar uma cópia no dispositivo." },
  { pergunta: "Como instalo o Plantel no celular ou computador?", resposta: "Toque em Instalar Plantel Listas quando a opção aparecer e siga as orientações para seu navegador. No iPhone ou iPad, abra no Safari e use Compartilhar > Adicionar à Tela de Início. Se o navegador não oferecer instalação, você pode continuar usando o site normalmente." },
  { pergunta: "Esqueci minha senha. O que faço?", resposta: "Na tela de entrada, toque em Esqueci a senha e informe o e-mail da sua conta. Confira sua caixa de entrada e a pasta de spam e siga as instruções recebidas. Se não conseguir recuperar o acesso, toque em Problemas com sua conta? na tela de entrada. Informe sua conta e um e-mail de contato ao qual tenha acesso; a equipe responderá em até 24 horas. Nunca envie sua senha ou códigos pelo Suporte." },
  { pergunta: "Posso enviar sugestões, opiniões ou elogios?", resposta: "Sim! O Suporte não é só para problemas. Conte o que gostou, o que pode melhorar ou uma ideia que facilitaria seu uso do Plantel. Use o formulário de mensagem abaixo." },
  { pergunta: "Onde recebo a resposta da equipe?", resposta: "A resposta é enviada ao e-mail da sua conta, mostrado nesta página. Após enviar, aguarde a confirmação na tela e confira também a pasta de spam. Se aparecer um erro, sua mensagem pode não ter sido enviada." }
];

const porPapel = {
  aluno: [{ pergunta: "Onde vejo os materiais que já acessei?", resposta: "Abra Meu Histórico no menu. Ali aparecem os materiais que você abriu ou baixou. Use Abrir novamente para voltar a um deles. Materiais que deixaram de estar disponíveis podem não aparecer." }],
  professor: [
    { pergunta: "Por que não consigo editar determinada pasta?", resposta: "Confira Pastas liberadas no menu. Você só pode gerenciar as pastas autorizadas para sua conta. Se faltar uma pasta, peça a liberação ao administrador. Conseguir visualizar um material não significa ter permissão para alterá-lo." },
    { pergunta: "Como envio um material para minha pasta?", resposta: "Na Biblioteca, entre em uma pasta liberada e toque em Adicionar material. Escolha um PDF ou vídeo e confira a pasta de destino. O nome é opcional: digite apenas o título, pois a extensão é adicionada automaticamente. Aguarde a confirmação antes de repetir o envio." }
  ],
  admin: [{ pergunta: "Como libero pastas para um professor?", resposta: "Abra Acessos no menu, selecione o professor e escolha as pastas ou disciplinas que ele poderá gerenciar. Confira a seleção e salve as alterações." }]
};

export function obterDuvidasSuporte(papel) {
  return [...comuns, ...(Object.hasOwn(porPapel, papel) ? porPapel[papel] : [])];
}
