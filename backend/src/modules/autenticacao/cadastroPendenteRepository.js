const AppError = require("../../shared/errors/AppError");
const invalido = () => new AppError("Este link expirou ou já foi usado. Solicite um novo link.",400,"CONFIRMACAO_EMAIL_INVALIDA");
function criarCadastroPendenteRepository(pool, usuarios, auditoria) {
  async function transacionar(fn) {
    const c = await pool.getConnection();
    try { await c.beginTransaction(); const r = await fn(c); await c.commit(); return r; }
    catch(e) {
      await c.rollback().catch(()=>{});
      if (["ER_LOCK_DEADLOCK","ER_LOCK_WAIT_TIMEOUT"].includes(e.code)) throw new AppError("Outra confirmação está em andamento. Tente novamente.",409,"ALTERACAO_CONCORRENTE");
      throw e;
    }
    finally { c.release(); }
  }
  async function criar(dados, hash) {
    return transacionar(async c => {
      await c.execute("INSERT INTO usuarios_email_travas(email) VALUES (?) ON DUPLICATE KEY UPDATE email=VALUES(email)",[dados.email]);
      const [existentes] = await c.execute("SELECT id FROM usuarios WHERE LOWER(TRIM(email))=? LIMIT 1 FOR UPDATE",[dados.email]);
      const [pendentes] = await c.execute("SELECT id FROM cadastros_publicos_pendentes WHERE email=? FOR UPDATE",[dados.email]);
      if (existentes.length || pendentes.length) throw new AppError("Este e-mail já possui conta ou cadastro pendente. Entre ou reenvie a confirmação.",409,"EMAIL_JA_CADASTRADO");
      const [r] = await c.execute("INSERT INTO cadastros_publicos_pendentes(nome,email,email_destino,senha_hash,termos_versao,privacidade_versao,termos_aceitos_em,faixa_etaria_declarada) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP(3),?)",[dados.nome,dados.email,dados.email,hash,dados.aceiteTermos.termos,dados.aceiteTermos.privacidade,dados.faixaEtaria]);
      return { id:r.insertId,nome:dados.nome,email:dados.email,senhaHash:hash };
    });
  }
  async function buscar(email) {
    const [r] = await pool.execute("SELECT id,nome,email,senha_hash AS senhaHash FROM cadastros_publicos_pendentes WHERE email=?",[email]);
    return r[0];
  }
  async function preparar(pendente, email, hash) {
    return transacionar(async c => {
      const [r] = await c.execute("SELECT senha_hash,enviado_em, TIMESTAMPDIFF(SECOND,enviado_em,CURRENT_TIMESTAMP(3)) AS segundos FROM cadastros_publicos_pendentes WHERE id=? FOR UPDATE",[pendente.id]);
      if (!r[0] || r[0].senha_hash !== pendente.senhaHash) throw invalido();
      if (r[0].enviado_em && Number(r[0].segundos)<60) throw new AppError("Aguarde 1 minuto antes de reenviar o link. Confira também Spam ou Lixo eletrônico.",429,"CONFIRMACAO_COOLDOWN");
      await c.execute("UPDATE cadastros_publicos_pendentes SET email_destino=?,token_hash=?,expira_em=DATE_ADD(CURRENT_TIMESTAMP(3),INTERVAL 1 HOUR),enviado_em=CURRENT_TIMESTAMP(3) WHERE id=?",[email,hash,pendente.id]);
    });
  }
  async function cancelar(hash) {
    // Nao cancelar um token mais recente emitido por outra requisicao.
    await pool.execute("UPDATE cadastros_publicos_pendentes SET token_hash=NULL,expira_em=NULL WHERE token_hash=?",[hash]);
  }
  async function confirmar(hash) {
    return transacionar(async c => {
      const [[alvo]] = await c.execute("SELECT email_destino FROM cadastros_publicos_pendentes WHERE token_hash=?",[hash]);
      if (!alvo) throw invalido();
      // Mesma ordem da criacao: trava do email antes da pendencia.
      await c.execute("INSERT INTO usuarios_email_travas(email) VALUES (?) ON DUPLICATE KEY UPDATE email=VALUES(email)",[alvo.email_destino]);
      const [r] = await c.execute("SELECT * FROM cadastros_publicos_pendentes WHERE token_hash=? AND expira_em>CURRENT_TIMESTAMP(3) FOR UPDATE",[hash]);
      if (!r[0] || r[0].email_destino !== alvo.email_destino) throw invalido();
      const p = r[0];
      const usuario = await usuarios.criar(p.nome,p.email_destino.trim().toLowerCase(),p.senha_hash,"aluno",c);
      await c.execute("UPDATE usuarios SET email_confirmado_em=CURRENT_TIMESTAMP(3) WHERE id=?",[usuario.id]);
      // Cadastros pendentes antigos continuam confirmáveis, sem inventar uma idade.
      if (p.faixa_etaria_declarada) await c.execute("UPDATE usuarios SET faixa_etaria_declarada=?,faixa_etaria_declarada_em=CURRENT_TIMESTAMP(3),faixa_etaria_origem='cadastro' WHERE id=?",[p.faixa_etaria_declarada,usuario.id]);
      // Pendencias anteriores a esta versao nao recebem aceite retroativo.
      if(p.termos_aceitos_em && p.termos_versao && p.privacidade_versao) {
        await c.execute("INSERT INTO aceites_termos_alunos(usuario_id,termos_versao,privacidade_versao,aceito_em,origem) SELECT ?,termos_versao,privacidade_versao,termos_aceitos_em,'cadastro' FROM cadastros_publicos_pendentes WHERE id=?",[usuario.id,p.id]);
        await auditoria.registrar({atorUsuarioId:usuario.id,acao:'termos_aceitos',entidade:'usuario',entidadeId:usuario.id,contexto:{termos:p.termos_versao,privacidade:p.privacidade_versao,origem:'cadastro'}},c);
      }
      await auditoria.registrar({atorUsuarioId:usuario.id,acao:"email_confirmado",entidade:"usuario",entidadeId:usuario.id,contexto:{cadastroPublico:true}},c);
      await c.execute("DELETE FROM cadastros_publicos_pendentes WHERE id=?",[p.id]);
      return usuario;
    });
  }
  return {criar,buscar,preparar,cancelar,confirmar};
}
module.exports = criarCadastroPendenteRepository;
