const AppError = require('../../shared/errors/AppError');
const { exigirObjeto, validarCamposPermitidos, normalizarNome } = require('./autenticacaoValidator');
const faixas = require('../../../../shared/faixasEtarias.json');
const { validarUsuarioId } = require('../usuarios/usuarioValidator');

function validarFaixaEtaria(valor) {
  if (!faixas.some(faixa => faixa.valor === valor)) {
    throw new AppError('Selecione sua faixa etária.', 400, 'FAIXA_ETARIA_INVALIDA');
  }
  return valor;
}

function criarFaixaEtariaService(pool, auditoria, usuarios) {
  async function obter(usuario) {
    if (usuario.papel !== 'aluno') return { aplicavel: false };
    const [[aluno]] = await pool.execute('SELECT faixa_etaria_declarada AS faixaEtaria,faixa_etaria_declarada_em AS declaradaEm,faixa_etaria_origem AS origem FROM usuarios WHERE id=? AND papel=\'aluno\' AND ativo=1 AND excluido_em IS NULL', [usuario.id]);
    if (!aluno) throw new AppError('Conta indisponível.', 403, 'ACESSO_NEGADO');
    return { aplicavel: true, ...aluno, verificada: false };
  }
  async function obterPerfil(usuario) {
    const faixa = await obter(usuario);
    if (!faixa.aplicavel) throw new AppError('Esta opção é exclusiva para alunos.', 403, 'ACESSO_NEGADO');
    const dados = await usuarios.obterDetalhes(usuario.id);
    if (!dados || dados.papel !== 'aluno' || !dados.ativo) throw new AppError('Conta indisponível.', 403, 'ACESSO_NEGADO');
    return { nome: dados.nome, email: dados.email, emailConfirmado: Boolean(dados.emailConfirmadoEm), criadoEm: dados.criadoEm, ...faixa };
  }
  async function obterParaAdmin(ator, parametroId) {
    if (ator.papel !== 'admin') throw new AppError('Operação exclusiva para administradores.', 403, 'ACESSO_NEGADO');
    const [[aluno]] = await pool.execute("SELECT nome,faixa_etaria_declarada AS faixaEtaria,faixa_etaria_declarada_em AS declaradaEm,faixa_etaria_origem AS origem FROM usuarios WHERE id=? AND papel='aluno' AND excluido_em IS NULL",[validarUsuarioId(parametroId)]);
    if (!aluno) throw new AppError('Aluno não encontrado.',404,'USUARIO_NAO_ENCONTRADO');
    return aluno;
  }
  async function atualizar(usuario, corpo, perfil = false, alvoAdmin = null) {
    const administrativa = alvoAdmin !== null;
    if (usuario.papel !== (administrativa ? 'admin' : 'aluno')) throw new AppError('Operação não autorizada.', 403, 'ACESSO_NEGADO');
    const id = administrativa ? validarUsuarioId(alvoAdmin) : usuario.id;
    exigirObjeto(corpo);
    validarCamposPermitidos(corpo, administrativa ? ['faixaEtaria','justificativa'] : perfil ? ['nome','faixaEtaria'] : ['faixaEtaria']);
    const faixa = validarFaixaEtaria(corpo.faixaEtaria);
    const nome = perfil ? normalizarNome(corpo.nome) : null;
    const justificativa = administrativa && typeof corpo.justificativa === 'string' ? corpo.justificativa.trim() : null;
    if (administrativa && (!justificativa || justificativa.length < 5 || justificativa.length > 500 || /[<>\u0000-\u001f\u007f]/.test(justificativa))) throw new AppError('Informe uma justificativa de 5 a 500 caracteres, sem dados sensíveis.',400,'JUSTIFICATIVA_INVALIDA');
    const c = await pool.getConnection();
    try {
      await c.beginTransaction();
      const [[aluno]] = await c.execute("SELECT nome,ativo,faixa_etaria_declarada FROM usuarios WHERE id=? AND papel='aluno' AND excluido_em IS NULL FOR UPDATE", [id]);
      if (!aluno) throw new AppError('Conta indisponível.', 403, 'ACESSO_NEGADO');
      if (!administrativa && !aluno.ativo) throw new AppError('Conta indisponível.',403,'ACESSO_NEGADO');
      if (aluno.faixa_etaria_declarada !== faixa) {
        if (!administrativa && ['menos_12','12_17'].includes(aluno.faixa_etaria_declarada)) throw new AppError('Para corrigir sua faixa etária, solicite uma revisão pelo Suporte. Seu acesso aos estudos continua disponível.',403,'FAIXA_ETARIA_CORRECAO_CONTROLADA');
        const origem = administrativa ? 'admin' : aluno.faixa_etaria_declarada ? 'perfil' : 'coleta_obrigatoria';
        await c.execute('UPDATE usuarios SET faixa_etaria_declarada=?,faixa_etaria_declarada_em=CURRENT_TIMESTAMP(3),faixa_etaria_origem=? WHERE id=?', [faixa, origem, id]);
        // Valores preservados somente na auditoria restrita, nunca no logger HTTP.
        await auditoria.registrar({ atorUsuarioId: usuario.id, acao: 'faixa_etaria_declarada', entidade: 'usuario', entidadeId: id, contexto: { verificada: false, origem, faixaAnterior: aluno.faixa_etaria_declarada, faixaNova: faixa, ...(administrativa ? { justificativa } : {}) } }, c);
      }
      if (perfil && aluno.nome !== nome) {
        await c.execute('UPDATE usuarios SET nome=? WHERE id=?', [nome, usuario.id]);
        await auditoria.registrar({ atorUsuarioId: usuario.id, acao: 'perfil_aluno_atualizado', entidade: 'usuario', entidadeId: usuario.id, contexto: { campo: 'nome' } }, c);
      }
      await c.commit();
      return { aplicavel: true, faixaEtaria: faixa, verificada: false, mensagem: 'Faixa etária salva. Seu acesso e seu histórico continuam iguais.' };
    } catch (erro) { await c.rollback().catch(() => {}); throw erro; }
    finally { c.release(); }
  }
  return { obter, atualizar, obterPerfil, obterParaAdmin, corrigirComoAdmin: (ator,id,corpo) => atualizar(ator,corpo,false,id), atualizarPerfil: (usuario,corpo) => atualizar(usuario,corpo,true) };
}
module.exports = { criarFaixaEtariaService, validarFaixaEtaria };
