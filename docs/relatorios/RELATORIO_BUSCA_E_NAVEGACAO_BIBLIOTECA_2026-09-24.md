# Relatório — busca e navegação na biblioteca

Data: 24/09/2026
Branch: `fase/09-qa-producao`
Estado: **IMPLEMENTADO E VALIDADO LOCALMENTE**

## 1. Objetivo e causa da limitação

Os formulários de criação de pasta, upload e movimentação de material recebiam as pastas permitidas, mas ofereciam apenas um `select` extenso, sem busca textual. Na área administrativa de organização, o seletor de pasta pai também não permitia pesquisar nem mostrava o caminho completo de nomes repetidos.

Na biblioteca, `acervoService.consultar` retornava uma lista vazia de pastas sempre que havia `busca`. A consulta do repositório paginava materiais, mas não pesquisava pastas. Assim, uma pesquisa como “matemática” podia localizar PDFs e vídeos, porém não oferecia as pastas correspondentes para navegação.

## 2. Implementação

### Seletor de pastas

Foi criado `frontend/src/SeletorPasta.jsx`, reutilizado nos formulários de:

- nova pasta da biblioteca;
- upload de material;
- movimentação de material;
- criação/edição de pasta na organização administrativa.

O componente filtra localmente a lista já recebida dos endpoints existentes por nome ou caminho, ignorando diferenças de maiúsculas e acentos. As opções exibem o caminho completo para distinguir nomes iguais. Até 80 opções são mostradas de cada vez; quando há mais, a interface orienta a refinar a busca. Uma opção já selecionada permanece disponível durante a digitação.

Os formulários de gestão continuam usando `GET /api/gestao-materiais/pastas`, que entrega somente pastas autorizadas ao professor ou todas as elegíveis ao administrador. A busca no navegador não amplia essa lista. As operações de escrita continuam sujeitas à autorização do backend. A organização administrativa reutiliza as categorias que já carregava e monta o caminho a partir da hierarquia existente.

### Resultados de pastas na biblioteca

`GET /api/acervo` foi reutilizado; não foi criado endpoint. Quando há pesquisa textual ou filtro de disciplina/concurso, o backend agora consulta também as pastas ativas e alcançáveis. A pesquisa considera nome, caminho, descrição e nomes de disciplina/concurso vinculados. Quando a busca parte de uma pasta, a consulta limita os resultados à sua subárvore por IDs, sem usar o texto do caminho como limite de acesso.

As pastas pesquisadas têm total e paginação próprios, combinados com a paginação já existente dos materiais na navegação de resultados. O modo normal, sem pesquisa nem filtro de disciplina/concurso, continua mostrando as subpastas diretas com suas contagens. O filtro de formato continua aplicado aos materiais; isoladamente, ele não transforma a lista de pastas em uma busca global.

Os cartões de pastas pesquisadas mostram o caminho completo. O clique usa a navegação de pasta já existente, que atualiza a URL e o breadcrumb. Pastas não são tratadas como materiais. Pastas desativadas e descendentes de uma pasta desativada não entram nos resultados de busca.

Não foram alterados Google Drive, migrations, schema, regras de negócio ou permissões.

## 3. Arquivos alterados

| Arquivo | Alteração |
| --- | --- |
| `frontend/src/SeletorPasta.jsx` | Novo seletor pesquisável e reutilizável. |
| `frontend/src/BibliotecaAcervo.jsx` | Integração do seletor, caminhos nos cartões e paginação combinada. |
| `frontend/src/PainelAcervo.jsx` | Busca e contexto de caminho no seletor administrativo. |
| `frontend/src/styles.css` | Layout responsivo e ajuste de alinhamento dos formulários. |
| `backend/src/modules/materiais/acervoRepository.js` | Consulta paginada de pastas com hierarquia, metadados e ramos ativos. |
| `backend/src/modules/materiais/acervoService.js` | Combina resultados de pastas e materiais sem alterar o endpoint. |
| `backend/test/acervo.integracao.test.js` | Testes de regressão da busca de pastas. |

## 4. Testes e evidências

- `npm run check`: aprovado — 168 testes backend, 5 testes PWA e build Vite.
- `git diff --check`: aprovado; apenas avisos informativos de conversão LF/CRLF no Windows.
- Testes integrados: nome com acento e sem acento, busca parcial, nomes iguais em caminhos diferentes, pesquisa limitada a uma subárvore, mistura de pasta/PDF/vídeo, paginação, disciplina e ramo desativado.
- A suíte de gestão existente confirmou que o seletor do professor não recebe pasta proibida e que tentativas de escrita nessa pasta retornam 403.
- No Chrome local, foi conferida a pesquisa do aluno, a exibição do caminho em resultados duplicados e o clique em pasta com URL e breadcrumb corretos.
- No Chrome local em largura de 390 px, foram conferidos os resultados da biblioteca e o formulário administrativo. O seletor também foi conferido no desktop, incluindo busca pelo caminho e seleção da opção encontrada.
- Os testes da PWA passaram, mas **não houve instalação e teste manual em aparelho físico** nesta tarefa. A interface responsiva é compartilhada com a PWA.
- Medição somente de leitura no MySQL local com acervo maior: pesquisa por “matemática”, 32 pastas, cerca de 102 ms; por “fisica”, 43 pastas, cerca de 58 ms. Não é uma medição de produção nem garantia de latência em todos os ambientes.
- As contas, pastas e material descartáveis usados na inspeção visual foram removidos do banco isolado de testes; a verificação final encontrou zero itens desses conjuntos.

## 5. Regressões e limites

Nenhuma regressão foi detectada nos testes ou na inspeção local. A verificação visual não substitui um teste em PWA instalada em iOS e Android nem uma medição de desempenho no banco de produção.

## 6. Estado de entrega

Este relatório registra a validação anterior à publicação na branch `fase/09-qa-producao`. O commit e o estado da publicação são informados separadamente na entrega. Os servidores locais temporários usados na inspeção foram desligados ao final.
