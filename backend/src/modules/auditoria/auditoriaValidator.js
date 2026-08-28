const AppError = require("../../shared/errors/AppError");

function inteiro(valor, padrao, maximo) {
  if (valor === undefined || valor === "") return padrao;
  const numero = Number(valor);
  if (!Number.isSafeInteger(numero) || numero < 1 || numero > maximo) {
    throw new AppError("Paginacao invalida", 400, "PAGINACAO_INVALIDA");
  }
  return numero;
}

function validarConsulta(query) {
  const permitidos = ["pagina", "limite", "acao", "busca", "inicio", "fim"];
  const extras = Object.keys(query).filter(function filtrar(chave) {
    return !permitidos.includes(chave);
  });
  if (extras.length) throw new AppError("Filtros invalidos", 400, "FILTROS_INVALIDOS");
  const acao = String(query.acao || "").trim().slice(0, 80);
  const busca = String(query.busca || "").trim().slice(0, 120);
  const inicio = query.inicio ? new Date(query.inicio + "T00:00:00.000Z") : null;
  const fim = query.fim ? new Date(query.fim + "T23:59:59.999Z") : null;
  if ((inicio && Number.isNaN(inicio.getTime())) || (fim && Number.isNaN(fim.getTime()))) {
    throw new AppError("Periodo invalido", 400, "PERIODO_INVALIDO");
  }
  return {
    pagina: inteiro(query.pagina, 1, 1000000),
    limite: inteiro(query.limite, 30, 100),
    acao: acao,
    busca: busca,
    inicio: inicio,
    fim: fim
  };
}

module.exports = { validarConsulta: validarConsulta };
