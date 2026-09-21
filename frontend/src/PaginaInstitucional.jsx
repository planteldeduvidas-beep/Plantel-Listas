import React, { useEffect, useState } from "react";
import { AlternadorTema, aplicarTema, lerTemaSalvo } from "./ComponentesInterface.jsx";

const ATUALIZACAO = "21 de setembro de 2026";

function LinkGooglePolicy() {
  return (
    <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
      Política de Dados do Usuário dos Serviços de API do Google
    </a>
  );
}

function CabecalhoInstitucional({ titulo, resumo, documento }) {
  return (
    <header className="cabecalho-institucional">
      <a className="marca-institucional" href="/" aria-label="Voltar ao Plantel Listas">
        <img src="/plantel-logo.png" alt="" />
        <span><strong>Plantel Listas</strong><small>Plantel de Dúvidas</small></span>
      </a>
      <nav aria-label="Documentos institucionais">
        <a href="/privacidade" aria-current={documento === "privacidade" ? "page" : undefined}>Privacidade</a>
        <a href="/termos" aria-current={documento === "termos" ? "page" : undefined}>Termos de Uso</a>
      </nav>
      <AlternadorTema classe="alternar-tema-institucional" />
      <div className="titulo-institucional">
        <span>Documento institucional</span>
        <h1>{titulo}</h1>
        <p>{resumo}</p>
        <small>Última atualização: {ATUALIZACAO}</small>
      </div>
    </header>
  );
}

function RodapeInstitucional({ documento }) {
  return (
    <footer className="rodape-institucional">
      <a className="voltar-institucional" href="/">Voltar ao Plantel Listas</a>
      <span>
        {documento === "privacidade" ? "Consulte também os " : "Consulte também a "}
        <a href={documento === "privacidade" ? "/termos" : "/privacidade"}>
          {documento === "privacidade" ? "Termos de Uso" : "Política de Privacidade"}
        </a>.
      </span>
    </footer>
  );
}

function PoliticaPrivacidade() {
  return (
    <>
      <section>
        <h2>1. Introdução</h2>
        <p>Esta Política de Privacidade explica como o Plantel Listas trata dados pessoais durante o acesso e o uso da plataforma por alunos, professores e administradores.</p>
      </section>

      <section>
        <h2>2. Responsável pelo tratamento</h2>
        <p>O Plantel Listas é uma plataforma do Plantel de Dúvidas, operada pela pessoa jurídica identificada abaixo:</p>
        <dl className="dados-pendentes">
          <div><dt>Razão social</dt><dd>PLANTEL DE DUVIDAS EDUCACAO E ENSINO LTDA - ME</dd></div>
          <div><dt>CNPJ</dt><dd>67.044.178/0001-05</dd></div>
          <div><dt>Contato de privacidade</dt><dd><a href="mailto:suporteplantellistas@gmail.com">suporteplantellistas@gmail.com</a></dd></div>
        </dl>
      </section>

      <section>
        <h2>3. Dados tratados</h2>
        <h3>Dados fornecidos pelo usuário</h3>
        <ul>
          <li>nome, e-mail e senha no cadastro e na administração da conta;</li>
          <li>assunto e mensagem enviados ao suporte, vinculados ao nome, e-mail e perfil da conta;</li>
          <li>nova senha e token temporário quando há recuperação de acesso.</li>
        </ul>
        <p>As senhas são protegidas por mecanismos criptográficos adequados e não são armazenadas em texto puro.</p>

        <h3>Dados técnicos e de segurança</h3>
        <ul>
          <li>sessões, tokens protegidos, datas de criação, expiração e revogação;</li>
          <li>cookies estritamente necessários à autenticação e à proteção contra requisições indevidas;</li>
          <li>identificador da requisição, endereço IP, user-agent, data e hora, que podem constar em logs operacionais e de segurança.</li>
        </ul>

        <h3>Registros de uso e auditoria</h3>
        <ul>
          <li>acessos a pastas, termos pesquisados, visualizações e downloads de materiais;</li>
          <li>histórico pessoal dos materiais acessados pelo aluno;</li>
          <li>ações administrativas e de professores, como alterações de usuários, permissões, pastas e materiais, com data, resultado e conta responsável.</li>
        </ul>
      </section>

      <section>
        <h2>4. Finalidades</h2>
        <p>Esses dados são utilizados para criar e administrar contas, autenticar usuários, recuperar o acesso, aplicar perfis e permissões, disponibilizar o acervo, manter o histórico do aluno, prestar suporte, produzir métricas internas, prevenir abuso, investigar falhas e registrar ações relevantes para segurança e auditoria.</p>
      </section>

      <section>
        <h2>5. Bases legais</h2>
        <p>O tratamento é realizado conforme as bases legais aplicáveis da Lei nº 13.709/2018 (LGPD), incluindo, conforme a finalidade, execução de contrato ou procedimentos relacionados, legítimo interesse, cumprimento de obrigação legal ou regulatória e consentimento quando ele for efetivamente necessário.</p>
      </section>

      <section>
        <h2>6. Compartilhamento e operadores</h2>
        <p>Os dados podem ser processados por serviços técnicos necessários ao funcionamento da plataforma, como hospedagem, banco de dados, envio de e-mail e Google Drive. O fornecedor definitivo de hospedagem ainda depende da configuração de produção. O Plantel Listas não vende dados pessoais.</p>
      </section>

      <section>
        <h2>7. Armazenamento e segurança</h2>
        <p>São adotadas medidas técnicas e organizacionais compatíveis com o serviço, incluindo controle de acesso por perfil, autenticação, proteção de credenciais, conexões seguras em produção e restrição de informações sensíveis nos logs. Nenhum sistema, entretanto, pode prometer segurança absoluta.</p>
      </section>

      <section>
        <h2>8. Retenção</h2>
        <p>Os dados são mantidos pelo tempo necessário às finalidades descritas e às obrigações aplicáveis. Os eventos brutos de analytics possuem retenção configurável, com padrão técnico atual de 180 dias; antes da exclusão, métricas diárias agregadas são preservadas. Registros de conta, histórico e auditoria podem ser mantidos enquanto necessários à operação, segurança e defesa de direitos.</p>
      </section>

      <section>
        <h2>9. Direitos do titular</h2>
        <p>Nos termos da LGPD, o titular pode solicitar confirmação do tratamento, acesso, correção, informações sobre compartilhamento, anonimização, bloqueio ou eliminação quando aplicável, portabilidade conforme regulamentação, oposição nos casos cabíveis e revogação do consentimento quando essa for a base utilizada. Algumas informações podem ser preservadas quando houver obrigação legal ou necessidade legítima de retenção.</p>
      </section>

      <section>
        <h2>10. Cookies e sessão</h2>
        <p>A plataforma utiliza cookies estritamente necessários para manter a sessão autenticada e aplicar proteção de segurança contra requisições indevidas. Esses cookies são configurados como HttpOnly, usam SameSite=Lax e, em produção, são enviados somente por conexão segura. Não foi identificado uso de cookies publicitários ou de rastreamento de terceiros.</p>
      </section>

      <section>
        <h2>11. Google Drive e APIs Google</h2>
        <p>O Google Drive é utilizado para consulta, organização, sincronização e operações autorizadas sobre arquivos e pastas do acervo institucional. A autorização OAuth é realizada pela conta institucional responsável pelo acervo; alunos não conectam suas contas Google ao Plantel Listas.</p>
        <p>O acesso é usado somente para as funcionalidades do acervo configurado. O token de renovação da conta institucional é mantido exclusivamente no backend e, quando persistido no banco de dados, é armazenado de forma criptografada. Ele não é exposto aos usuários. O uso de informações recebidas das APIs Google segue a <LinkGooglePolicy />, inclusive seus requisitos de Uso Limitado.</p>
      </section>

      <section>
        <h2>12. Alterações desta política</h2>
        <p>Esta Política poderá ser atualizada para refletir mudanças no serviço, na legislação ou nos provedores utilizados. A data da versão vigente será informada nesta página.</p>
      </section>

      <section>
        <h2>13. Contato</h2>
        <p>Solicitações relacionadas à privacidade e ao exercício de direitos deverão ser encaminhadas para <a href="mailto:suporteplantellistas@gmail.com">suporteplantellistas@gmail.com</a>.</p>
      </section>
    </>
  );
}

function TermosUso() {
  return (
    <>
      <section><h2>1. Aceitação dos Termos</h2><p>Ao utilizar o Plantel Listas, o usuário se compromete a observar estes Termos de Uso e as regras aplicáveis à sua conta e ao conteúdo acessado.</p></section>
      <section><h2>2. Finalidade da plataforma</h2><p>O Plantel Listas é uma plataforma destinada ao acesso e ao gerenciamento de materiais educacionais disponibilizados pelo Plantel de Dúvidas.</p></section>
      <section><h2>3. Cadastro e conta</h2><p>O usuário deve fornecer informações corretas, proteger suas credenciais e usar apenas a própria conta. Não é permitido compartilhar acesso de forma indevida nem permitir que terceiros utilizem a conta em seu nome.</p></section>
      <section><h2>4. Perfis e permissões</h2><p>As funcionalidades disponíveis variam conforme o perfil de aluno, professor ou administrador. O acesso a determinada função não autoriza o uso de outras áreas ou dados fora das permissões concedidas.</p></section>
      <section><h2>5. Uso dos materiais</h2><p>Os materiais devem ser utilizados para as finalidades educacionais disponibilizadas pelo Plantel e conforme os direitos autorais e demais condições aplicáveis. A presença de um conteúdo na plataforma não significa, por si só, que o Plantel seja titular de todos os direitos sobre ele.</p></section>
      <section>
        <h2>6. Condutas proibidas</h2>
        <p>É proibido:</p>
        <ul>
          <li>tentar acessar áreas, contas, arquivos ou dados sem autorização;</li>
          <li>contornar mecanismos de segurança ou compartilhar credenciais;</li>
          <li>interferir no funcionamento da plataforma ou realizar atividades ilícitas;</li>
          <li>extrair, copiar em massa ou manipular dados e materiais sem autorização;</li>
          <li>usar a plataforma de forma que prejudique outros usuários ou o Plantel.</li>
        </ul>
      </section>
      <section><h2>7. Professores e gerenciamento do acervo</h2><p>Professores autorizados podem realizar operações sobre materiais e pastas dentro do escopo concedido pela administração. Essas permissões podem ser ajustadas ou revogadas conforme a organização do serviço.</p></section>
      <section><h2>8. Disponibilidade</h2><p>A plataforma pode ficar temporariamente indisponível por manutenção, atualização, falha técnica, indisponibilidade de terceiros ou eventos fora do controle razoável do Plantel. Não há promessa de disponibilidade ininterrupta.</p></section>
      <section><h2>9. Serviços e links externos</h2><p>O Plantel Listas pode apresentar links para sites, cursos, professores ou parceiros externos. Ao seguir esses links, o usuário deixa o ambiente do Plantel Listas. O Plantel não controla os termos, pagamentos, políticas de privacidade ou o funcionamento dessas plataformas e não participa automaticamente de contratações realizadas diretamente com terceiros.</p></section>
      <section><h2>10. Propriedade intelectual</h2><p>A interface, a marca e os elementos próprios da plataforma são protegidos pela legislação aplicável. Materiais educacionais podem pertencer ao Plantel, a professores, parceiros ou outros titulares. O usuário deve respeitar os direitos e as condições informadas para cada conteúdo.</p></section>
      <section><h2>11. Suspensão e encerramento de acesso</h2><p>O acesso poderá ser restringido ou suspenso em caso de fraude, abuso, tentativa de invasão, descumprimento destes Termos, risco à segurança ou uso indevido da plataforma, respeitadas as circunstâncias aplicáveis.</p></section>
      <section><h2>12. Privacidade</h2><p>O tratamento de dados pessoais é explicado na <a href="/privacidade">Política de Privacidade</a>.</p></section>
      <section><h2>13. Alterações destes Termos</h2><p>Estes Termos poderão ser revisados para acompanhar mudanças no serviço ou nas regras aplicáveis. A data da versão vigente será exibida nesta página.</p></section>
      <section><h2>14. Contato</h2><p>Dúvidas sobre estes Termos deverão ser enviadas para <a href="mailto:suporteplantellistas@gmail.com">suporteplantellistas@gmail.com</a>.</p></section>
    </>
  );
}

function PaginaInstitucional({ documento }) {
  const [temaInicial] = useState(lerTemaSalvo);
  const privacidade = documento === "privacidade";
  const titulo = privacidade ? "Política de Privacidade" : "Termos de Uso";
  const resumo = privacidade
    ? "Como o Plantel Listas utiliza e protege os dados necessários ao funcionamento da plataforma."
    : "As condições essenciais para utilizar o Plantel Listas e acessar o acervo educacional.";

  useEffect(function prepararPagina() {
    aplicarTema(temaInicial);
    const tituloAnterior = document.title;
    const descricao = document.querySelector('meta[name="description"]');
    const descricaoAnterior = descricao ? descricao.getAttribute("content") : null;
    document.title = titulo + " | Plantel Listas";
    if (descricao) descricao.setAttribute("content", resumo);
    return function restaurarMetadados() {
      document.title = tituloAnterior;
      if (descricao && descricaoAnterior !== null) descricao.setAttribute("content", descricaoAnterior);
    };
  }, [resumo, temaInicial, titulo]);

  return (
    <main className="pagina-institucional">
      <CabecalhoInstitucional titulo={titulo} resumo={resumo} documento={documento} />
      <article className="conteudo-institucional">
        {privacidade ? <PoliticaPrivacidade /> : <TermosUso />}
      </article>
      <RodapeInstitucional documento={documento} />
    </main>
  );
}

export default PaginaInstitucional;
