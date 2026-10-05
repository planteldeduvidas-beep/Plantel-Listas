const test = require("node:test");
const assert = require("node:assert/strict");
const { validarNomeCadastro, normalizarNome } = require("../src/modules/autenticacao/autenticacaoValidator");
const { validarCriacao, validarEdicao } = require("../src/modules/usuarios/usuarioValidator");

test("cadastro exige nome e sobrenome sem restringir acentos ou nomes compostos", () => {
  for (const nome of ["Ana", " Ana  ", "Ana de", "João dos", "Ana 123", "123 456"]) {
    assert.throws(() => validarNomeCadastro(nome), erro => erro.codigo === "NOME_COMPLETO_OBRIGATORIO");
  }
  for (const nome of ["Ana Silva", "João da Silva", "Maria Clara Souza", "Ana-Maria D’Ávila", "José O'Connor", "李 王"]) {
    assert.equal(validarNomeCadastro(nome), nome);
  }
  assert.equal(validarNomeCadastro("  João   da\tSilva  "), "João da Silva");
  for (const nome of [null, "", "A".repeat(121), "Ana <Silva>"]) {
    assert.throws(() => validarNomeCadastro(nome), erro => erro.codigo === "NOME_INVALIDO");
  }
});

test("criacao administrativa usa a mesma regra, mas edicao de nomes existentes permanece compativel", () => {
  for (const papel of ["aluno", "professor", "admin"]) {
    const dados = {nome:"Ana",email:"ana@outlook.com",senha:"Senha-forte-123",papel};
    assert.throws(() => validarCriacao(dados), erro => erro.codigo === "NOME_COMPLETO_OBRIGATORIO");
    assert.equal(validarCriacao({...dados,nome:"Ana Silva"}).nome,"Ana Silva");
  }
  assert.equal(normalizarNome("Ana"), "Ana");
  assert.equal(validarEdicao({nome:"Ana",email:"ana@outlook.com"}).nome,"Ana");
});
