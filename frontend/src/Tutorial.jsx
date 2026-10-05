import React from "react";

const GUIAS = Object.freeze({
  aluno: {
    titulo: "Guia do aluno",
    introducao: "Escolha uma área abaixo. Cada explicação mostra onde tocar e o que acontece depois.",
    areas: [
      {
        area: "acervo", titulo: "Biblioteca", resumo: "Encontre pastas, PDFs e vídeos.",
        passos: [
          "No menu, toque em Biblioteca. No celular, abra o menu pelo botão de três linhas no canto superior esquerdo.",
          "Para explorar, toque no nome de uma pasta. O caminho acima da lista mostra onde você está; toque em Início para voltar ao começo.",
          "Para procurar algo, digite uma palavra no campo de busca e toque em Buscar. O botão Filtros permite escolher tipo, disciplina ou concurso. Os resultados podem incluir pastas e arquivos.",
          "No arquivo desejado, toque em Abrir para ver o PDF ou assistir ao vídeo. Toque em Baixar quando quiser guardar uma cópia no dispositivo.",
          "Acima da busca fica a faixa Avisos. Mensagens sublinhadas podem levar a uma página externa; confira o destino antes de abrir."
        ], dica: "Se não encontrar o material, limpe os filtros ou tente parte do nome. Uma pasta encontrada na busca abre normalmente ao toque."
      },
      {
        area: "meuHistorico", titulo: "Meu Histórico", resumo: "Volte a um material usado antes.",
        passos: [
          "No menu, toque em Meu Histórico.",
          "A lista mostra os arquivos que você abriu ou baixou, com a ação e a data mais recentes.",
          "Toque em Abrir novamente para retornar ao material. Use Anterior e Próxima quando houver mais páginas."
        ], dica: "O histórico é só seu. Materiais que não estão mais disponíveis deixam de aparecer."
      },
      {
        area: "suporte", titulo: "Suporte", resumo: "Tire dúvidas e compartilhe sugestões.",
        passos: [
          "No menu, toque em Suporte.",
          "Leia as Dúvidas frequentes se quiser uma resposta rápida. Para falar com a equipe, escreva um assunto curto e conte sua dúvida, problema, opinião ou sugestão no campo Mensagem.",
          "Se relatar um problema com material, diga em qual pasta ou arquivo ele ocorreu e qual aviso apareceu.",
          "Toque em Enviar mensagem e aguarde a confirmação na tela. A resposta será enviada ao e-mail da sua conta."
        ], dica: "Nunca envie senha ou código de acesso na mensagem."
      }
    ]
  },
  professor: {
    titulo: "Guia do professor",
    introducao: "Veja como encontrar suas pastas e trabalhar somente no acervo liberado para você.",
    areas: [
      {
        area: "minhasPastas", titulo: "Pastas liberadas", resumo: "Confira onde você pode trabalhar.",
        passos: [
          "No menu, toque em Pastas liberadas.",
          "Confira a lista de pastas sob sua responsabilidade. Ela é definida pelo administrador.",
          "Se a pasta esperada não aparecer, peça ao administrador a liberação antes de tentar alterá-la."
        ], dica: "Ver um material na Biblioteca não significa ter permissão para editá-lo."
      },
      {
        area: "acervo", titulo: "Biblioteca", resumo: "Pesquise, envie e organize materiais autorizados.",
        passos: [
          "Abra Biblioteca no menu. Entre em uma pasta pelo nome ou use Buscar e Filtros para localizar o conteúdo.",
          "Para criar uma pasta, toque em Nova pasta e informe o nome. Escolha Pasta principal para ela aparecer no início da Biblioteca: você receberá permissão para gerenciar essa nova pasta e suas subpastas, sem acesso às demais. Escolha Subpasta para criar dentro de uma pasta que você já gerencia; procure pelo nome e confira o caminho. Aguarde a confirmação: ela será salva também no Google Drive.",
          "Toque em Adicionar material e selecione até 10 PDFs ou vídeos para a mesma pasta autorizada. Eles serão enviados um por vez. Em lote, cada material usa o nome do seu arquivo; para um único arquivo, o título é opcional. Disciplina e Concurso são opcionais e valem para toda a seleção.",
          "Acompanhe o resultado de cada arquivo na Fila de envio. Se parar, use Continuar fila: os concluídos não serão reenviados. Se fechar ou atualizar a tela, selecione novamente somente os arquivos ainda não enviados; use Retomar envio para o arquivo que ficou pendente.",
          "Você pode enviar um arquivo de uma pasta autorizada diretamente para a lixeira, sem aprovação. Para uma pasta inteira, toque em Solicitar exclusão e confirme o pedido. Nada será removido até um administrador aprovar. Acompanhe em Solicitações de exclusão de pastas e toque em Atualizar solicitações.",
          "O progresso mostra os bytes confirmados no Google Drive. Mantenha a tela aberta, inclusive no aplicativo instalado. Se o envio parar, selecione o mesmo arquivo e use Retomar envio: os dados e a pasta originais serão mantidos. O envio fica disponível por até 24 horas; use Cancelar envio pendente para descartá-lo. O material só aparece após a confirmação final.",
          "Nos materiais que você pode gerenciar, abra as opções para editar o nome, mover, substituir o arquivo ou enviar para a lixeira. Confira o destino antes de salvar."
        ], dica: "Se a ação não estiver disponível ou for negada, confirme a pasta em Pastas liberadas."
      },
      {
        area: "suporte", titulo: "Suporte", resumo: "Peça ajuda ou envie sugestões.",
        passos: [
          "No menu, toque em Suporte.",
          "Consulte as Dúvidas frequentes ou envie uma mensagem com sua dúvida, opinião ou sugestão. Se uma ação falhou, informe o nome da pasta ou arquivo e a mensagem de erro exibida.",
          "Toque em Enviar mensagem. A equipe responderá ao e-mail da sua conta."
        ], dica: "Não inclua senhas, códigos ou links privados na mensagem."
      }
    ]
  },
  admin: {
    titulo: "Guia do administrador",
    introducao: "Passe por cada tela de gestão com passos práticos. Abra somente a área que precisa usar agora.",
    areas: [
      {
        area: "estatisticas", titulo: "Visão geral", resumo: "Entenda o uso real da biblioteca.",
        passos: [
          "No menu, toque em Visão geral. Em Período, escolha 7, 30 ou 90 dias.",
          "Os gráficos de atividade mostram somente alunos. Compare navegações, aberturas de arquivos e downloads por dia e por mês; administradores e professores ficam fora dessas contagens.",
          "Em Engajamento, veja quantos alunos distintos navegaram ou abriram materiais. Não some as pessoas de dias diferentes. Consulte também os gráficos de buscas, pastas, materiais, disciplinas e concursos.",
          "Os cartões de contas e os gráficos de composição do acervo mostram o cadastro atual. Operações da equipe e resumos antigos sem separação de perfis aparecem em seções próprias; os dados são preservados.",
          "Toque em Relatório CSV para baixar os dados quando precisar analisá-los fora do sistema."
        ], dica: "Navegação é entrada na biblioteca ou em pasta; não é login nem número de visitantes únicos."
      },
      {
        area: "acervo", titulo: "Biblioteca", resumo: "Cuide dos arquivos e das pastas do acervo.",
        passos: [
          "Abra Biblioteca. Use pastas, Busca e Filtros para chegar ao lugar desejado; confira o caminho antes de modificar algo.",
          "Toque em Nova pasta para criar uma pasta no destino correto. Em Adicionar material, selecione até 10 PDFs ou vídeos e a pasta de destino. O envio é sequencial; cada arquivo conserva seu nome em lote. Disciplina e Concurso são opcionais e valem para toda a seleção. Os limites de tamanho por arquivo continuam os mesmos.",
          "Na Fila de envio, acompanhe quais arquivos foram concluídos. Se houver falha, use Continuar fila, sem reenviar os concluídos. Mantenha a tela aberta; ao fechar, os arquivos ainda não enviados precisam ser selecionados novamente.",
          "Em Solicitações de exclusão de pastas, qualquer administrador pode analisar pedidos dos professores. Use Ver pasta, confira o conteúdo e escolha Analisar exclusão ou Recusar. A aprovação envia a pasta inteira e suas subpastas para a lixeira do Drive; a recusa não altera arquivos. As permissões do professor são verificadas novamente.",
          "Uploads novos são enviados em partes, com progresso confirmado pelo Drive. Mantenha a tela aberta. Em caso de interrupção, selecione o mesmo arquivo e use Retomar envio; a pasta original não muda. Você pode retomar por até 24 horas ou cancelar o envio pendente. A substituição de um material ainda utiliza o envio simples e seu limite próprio.",
          "No material, abra as opções para renomear, mover, substituir ou enviar à lixeira. Confirme o nome e a pasta antes de salvar.",
          "Se aparecer 'pasta para revisar', você pode continuar enviando arquivos normalmente. Para resolver o aviso, marque a pasta, escolha a Disciplina e/ou o Concurso indicados como pendentes (ou 'Não se aplica') e toque em Salvar escolhas. 'Não alterar' mantém a pendência para depois.",
          "Abra Lixeira para restaurar um item. A exclusão definitiva não pode ser desfeita: confira o item antes de confirmar."
        ], dica: "Mudanças em pastas e arquivos vinculados ao Google Drive também afetam a integração. Evite repetir uma ação enquanto ela estiver processando."
      },
      {
        area: "usuarios", titulo: "Usuários", resumo: "Crie contas e ajuste o acesso de cada pessoa.",
        passos: [
          "No menu, toque em Usuários. Use Buscar, Tipo e Conta para localizar alguém pelo nome, e-mail, papel ou estado.",
          "Para cadastrar, toque em Novo usuário, preencha nome, e-mail e senha temporária, escolha Aluno, Professor ou Administrador e toque em Criar usuário.",
          "Na linha da pessoa, o seletor Tipo de usuário altera o papel. Em Opções, você encontra Editar dados, Redefinir senha e Bloquear/Liberar conta.",
          "Depois de uma alteração, confira o papel e o estado exibidos na própria linha."
        ], dica: "Confira o e-mail antes de criar a conta e conceda somente o papel necessário."
      },
      {
        area: "acessos", titulo: "Acessos", resumo: "Defina as áreas de trabalho dos professores.",
        passos: [
          "No menu, toque em Acessos e escolha um professor no campo Professor.",
          "Em Disciplinas autorizadas, marque as disciplinas sob sua responsabilidade; isso libera os ramos classificados nelas e suas subpastas.",
          "Use Acessos específicos por pasta apenas quando precisar liberar uma pasta isolada. Revise as escolhas e toque em Salvar acessos.",
          "Peça ao professor para conferir Pastas liberadas e testar a pasta após a confirmação."
        ], dica: "A disciplina é a forma mais rápida de liberar várias pastas; pastas não classificadas podem exigir liberação específica."
      },
      {
        area: "organizacao", titulo: "Organização", resumo: "Mantenha pastas, disciplinas e concursos organizados.",
        passos: [
          "Em Organização, use Localizar pasta para encontrar uma pasta pelo nome e conferir se ela é principal ou filha.",
          "Toque em Nova pasta, informe o nome e escolha onde criar. Pasta principal aparece no início da Biblioteca; Subpasta fica dentro da pasta que você escolher. Use Localizar pasta e confira o caminho completo. As duas opções criam a pasta também no Google Drive. Aguarde a confirmação antes de enviar materiais. Professores também podem criar pastas principais e recebem gestão somente sobre a nova pasta e suas subpastas.",
          "Se uma pasta antiga mostrar Vincular ao Drive, use esse botão para corrigir o cadastro mantendo seus acessos. Vincule primeiro a pasta principal e depois suas subpastas. Se houver nomes duplicados ou conflito, o sistema interrompe a operação para revisão.",
          "Mais abaixo, gerencie os catálogos Disciplinas e Concursos, que são opções usadas nos filtros e na classificação.",
          "Para renomear uma pasta vinculada ao Google Drive, use a opção da pasta na Biblioteca. Para excluí-la, confira a confirmação: o conteúdo e as subpastas também serão enviados à lixeira do Drive. A edição somente local é bloqueada para evitar divergência."
        ], dica: "Antes de ocultar uma pasta, verifique se ela contém materiais que alunos ou professores ainda precisam."
      },
      {
        area: "historico", titulo: "Histórico", resumo: "Consulte ações administrativas registradas.",
        passos: [
          "No menu, toque em Histórico.",
          "Use o campo Mostrar para escolher uma ação ou deixe Todas as atividades.",
          "Leia a descrição, o responsável e a data de cada registro para entender o que mudou."
        ], dica: "Este histórico de auditoria é diferente de Meu Histórico, que registra materiais usados por cada aluno."
      },
      {
        area: "drive", titulo: "Google Drive", resumo: "Acompanhe a conexão e a sincronização.",
        passos: [
          "No menu, toque em Google Drive. Confira se a conta está conectada e veja a última atualização e o número de arquivos encontrados.",
          "Quando a conexão exigir renovação, use Renovar conexão e conclua a autorização na conta correta.",
          "Se precisar conferir mudanças feitas diretamente no Drive, use Atualizar materiais agora e aguarde o resultado. A atualização automática também busca manter o acervo sincronizado."
        ], dica: "Não clique várias vezes durante uma sincronização em andamento. Se aparecer erro, anote a mensagem antes de tentar novamente."
      },
      {
        area: "parceiros", titulo: "Parceiros", resumo: "Gerencie os cards de divulgação.",
        passos: [
          "No menu, toque em Parceiros e depois em Novo parceiro.",
          "Preencha as informações do parceiro, confira link, imagem e benefício quando usados e salve.",
          "Revise a lista e use Ativar para mostrar o card; Editar ajusta os dados e Arquivar retira o card da exibição."
        ], dica: "Salvar o cadastro não publica o parceiro automaticamente."
      },
      {
        area: "avisos", titulo: "Avisos", resumo: "Publique mensagens na faixa do aluno.",
        passos: [
          "No menu, toque em Avisos e depois em Novo aviso.",
          "Escreva uma mensagem curta. Se ela levar a uma parceria ou página, preencha Link HTTPS (opcional). Ajuste a Ordem quando necessário.",
          "Marque Exibir aos alunos e toque em Salvar aviso. Confira a Prévia da faixa; use Editar ou Arquivar para mudar a publicação."
        ], dica: "Um aviso sem link é apenas informativo. Um aviso com link fica clicável para o aluno e abre outra aba."
      }
    ]
  }
});

export function obterGuia(papel) { return GUIAS[papel] || null; }

export default function Tutorial({ papel, aoAbrir }) {
  const guia = obterGuia(papel);
  if (!guia) return null;

  return <section className="bloco-admin painel-conteudo tutorial-painel" aria-label={guia.titulo}>
    <div className="cabecalho-bloco"><div><h2>{guia.titulo}</h2><p>{guia.introducao}</p></div></div>
    <div className="tutorial-orientacao">
      <h3>Primeiros passos em qualquer tela</h3>
      <ol>
        <li>Abra o menu lateral para escolher uma área. No celular, toque no botão de três linhas no alto da tela.</li>
        <li>Se entrar no lugar errado, use Voltar ou escolha outra área no menu. Para trocar as cores, use o botão de tema no alto.</li>
        <li>Site do Plantel abre a página institucional. Os cards Parceiros Plantel ficam mais abaixo no menu; toque em Conhecer para ver a oferta em outra aba.</li>
        <li>Quando terminar, procure sua conta na parte de baixo do menu e toque em Sair. No celular, deslize o menu para baixo se necessário.</li>
        <li>Para confirmar ou corrigir seu endereço, toque em Atualizar ou confirmar e-mail, perto da sua conta no menu. Informe o endereço e sua senha atual, abra o link enviado e confirme na mesma conta. Até concluir, o e-mail antigo continua válido. Confira também Spam ou Lixo eletrônico e Promoções, se houver, para mensagens de confirmação, recuperação de senha e suporte, em qualquer provedor.</li>
        <li>Depois de criar uma conta, enviamos um link para confirmar seu e-mail. Entre com a conta que criou e abra o link recebido. A confirmação e os lembretes não bloqueiam seu acesso. Se o endereço estiver errado ou o link não chegar, use Atualizar ou confirmar e-mail para corrigir ou reenviar.</li>
      </ol>
    </div>
    <h3 className="tutorial-secao-titulo">Escolha a parte que deseja aprender</h3>
    <div className="tutorial-lista">{guia.areas.map((item, indice) => <details key={item.area} className="tutorial-area" open={indice === 0}>
      <summary><span className="tutorial-numero" aria-hidden="true">{String(indice + 1).padStart(2, "0")}</span><span className="tutorial-area-nome"><strong>{item.titulo}</strong><small>{item.resumo}</small></span><span className="tutorial-expandir" aria-hidden="true">⌄</span></summary>
      <div className="tutorial-area-corpo">
        <ol>{item.passos.map((passo, numero) => <li key={numero}>{passo}</li>)}</ol>
        <p className="tutorial-dica"><strong>Vale saber:</strong> {item.dica}</p>
        <button type="button" className="botao-principal" onClick={() => aoAbrir(item.area)}>Abrir {item.titulo}</button>
      </div>
    </details>)}</div>
  </section>;
}
