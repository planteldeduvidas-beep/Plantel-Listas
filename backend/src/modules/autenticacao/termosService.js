const versoes = require('../../../../shared/documentosLegais.json');
const AppError = require('../../shared/errors/AppError');
const { exigirObjeto, validarCamposPermitidos } = require('./autenticacaoValidator');

function validarAceite(aceite) {
  if (!aceite || aceite.aceito !== true) throw new AppError('Marque a caixa para aceitar os Termos de Uso e declarar ciência da Política de Privacidade.',400,'ACEITE_TERMOS_OBRIGATORIO');
  exigirObjeto(aceite);
  validarCamposPermitidos(aceite,['aceito','termos','privacidade']);
  if (aceite.termos !== versoes.termos || aceite.privacidade !== versoes.privacidade) {
    throw new AppError('Os documentos foram atualizados. Atualize a página e leia a versão atual antes de aceitar.',409,'VERSAO_TERMOS_DESATUALIZADA');
  }
}
function criarTermosService(pool,auditoria) {
  async function obter(usuario) {
    if (usuario.papel !== 'aluno') return {aplicavel:false};
    const [registros] = await pool.execute('SELECT aceito_em FROM aceites_termos_alunos WHERE usuario_id=? AND termos_versao=? AND privacidade_versao=?',[usuario.id,versoes.termos,versoes.privacidade]);
    return {aplicavel:true,pendente:registros.length===0,versoes};
  }
  async function aceitar(usuario,corpo) {
    if (usuario.papel !== 'aluno') throw new AppError('Esta opção é exclusiva para alunos.',403,'ACESSO_NEGADO');
    validarAceite(corpo);
    const c = await pool.getConnection();
    try {
      await c.beginTransaction();
      const [[atual]] = await c.execute('SELECT papel,ativo,excluido_em FROM usuarios WHERE id=? FOR UPDATE',[usuario.id]);
      if (!atual || atual.papel !== 'aluno' || !atual.ativo || atual.excluido_em) throw new AppError('Esta opção é exclusiva para alunos ativos.',403,'ACESSO_NEGADO');
      const [r] = await c.execute("INSERT IGNORE INTO aceites_termos_alunos(usuario_id,termos_versao,privacidade_versao,origem) VALUES (?,?,?,'conta')",[usuario.id,versoes.termos,versoes.privacidade]);
      if (r.affectedRows) await auditoria.registrar({atorUsuarioId:usuario.id,acao:'termos_aceitos',entidade:'usuario',entidadeId:usuario.id,contexto:{...versoes,origem:'conta'}},c);
      await c.commit();
      return {aplicavel:true,pendente:false,versoes};
    } catch(e) { await c.rollback().catch(()=>{}); throw e; }
    finally { c.release(); }
  }
  return {obter,aceitar};
}
module.exports = {criarTermosService,validarAceite};
