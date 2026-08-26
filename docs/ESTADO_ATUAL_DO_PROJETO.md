# ESTADO ATUAL DO PROJETO - PLANTEL LISTAS
Atualizado em 26/08/2026

## Status
FASE 0 - documentacao e preparacao.

V1 funcionalmente congelada.

## Infraestrutura definida
- Hostinger Business Web Hosting ate 17/03/2030.
- Node.js/Express em producao.
- MySQL da Hostinger.
- Desenvolvimento local com Laragon + MySQL + MySQL Workbench.
- React + Vite no frontend.
- Google Drive para PDFs/videos.

## Drive
Pasta raiz:
`10Kokm2f3IpeOFuzIJvJDc4HpHZpBoOIX`

Conteudo raiz confirmado:
- LISTAS
- PROVAS ANTIGAS

A equipe informou que o conteudo disponivel nessa pasta corresponde ao acervo atual a ser usado.

## Usuarios
Roles fechadas:
- aluno
- professor
- admin

Aluno tera cadastro e login.

Professor:
- pode gerenciar arquivos somente em areas autorizadas;
- nao acessa analytics/relatorios/auditoria geral.

Admin:
- controle administrativo completo.

## Pendencias tecnicas que nao alteram regra de negocio
1. Configurar projeto Google Cloud e Drive API.
2. Validar menor escopo OAuth que atende ao acervo legado e operacoes de escrita.
3. Definir subdominio/URL final.
4. Definir remetente SMTP de recuperacao de senha.
5. Testar limite pratico de upload de videos na Hostinger.
6. Criar repositorio e estrutura inicial.
7. Executar Fase 1.

## Proxima acao autorizada
Criar repositorio/estrutura da Fase 1 somente depois de o responsavel inserir estes documentos em `/docs` e entregar ao Codex o prompt da Fase 1.
