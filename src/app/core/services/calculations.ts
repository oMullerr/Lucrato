import {
  Compra, Venda, Configuracoes,
  CompraCalculada, VendaCalculada, KpiResumo, StatusEstoque
} from '../models/models';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Calcula campos derivados de uma compra. */
export function calcularCompra(
  compra: Compra,
  vendas: Venda[],
  config: Configuracoes,
): CompraCalculada {
  const custoTotalCompra = compra.qtdComprada * compra.custoUnitario;
  const custoTotalReal = custoTotalCompra + compra.freteCompra + compra.outrosCustos;
  const custoUnitarioReal = compra.qtdComprada > 0 ? custoTotalReal / compra.qtdComprada : 0;

  const vendasDoLote = vendas.filter(v => v.idLote === compra.id && v.status === 'Concluída');
  const qtdVendida = vendasDoLote.reduce((s, v) => s + v.qtdVendida, 0);
  const estoqueAtual = compra.qtdComprada - qtdVendida;
  const valorParado = estoqueAtual > 0 ? estoqueAtual * custoUnitarioReal : 0;

  const datas = vendasDoLote.map(v => v.dataVenda).sort();
  const primeiraVenda = datas[0];
  const ultimaVenda = datas[datas.length - 1];

  const compraDate = new Date(compra.dataCompra);
  const referencia = (estoqueAtual <= 0 && ultimaVenda)
    ? new Date(ultimaVenda)
    : new Date();
  const diasEmEstoque = Math.floor((referencia.getTime() - compraDate.getTime()) / MS_PER_DAY);

  let status: StatusEstoque;
  if (estoqueAtual <= 0) status = 'Vendido';
  else if (diasEmEstoque >= config.diasAlertaVermelho) status = 'Parado';
  else if (diasEmEstoque >= config.diasAlertaAmarelo) status = 'Atenção';
  else status = 'Em Estoque';

  // Margem ponderada das vendas concluídas
  const totalReceita = vendasDoLote.reduce((s, v) => s + v.qtdVendida * v.precoUnitario, 0);
  const totalLucro = vendasDoLote.reduce((s, v) => {
    const recBruta = v.qtdVendida * v.precoUnitario;
    const recLiq = recBruta - recBruta * v.taxaPercentual - v.freteVendedor - v.desconto - v.outrosCustos;
    return s + (recLiq - v.qtdVendida * custoUnitarioReal);
  }, 0);
  const margemMedia = totalReceita > 0 ? totalLucro / totalReceita : undefined;

  return {
    ...compra,
    custoTotalCompra,
    custoTotalReal,
    custoUnitarioReal,
    qtdVendida,
    estoqueAtual,
    valorParado,
    primeiraVenda,
    ultimaVenda,
    diasEmEstoque,
    status,
    margemMedia,
  };
}

/** Calcula campos derivados de uma venda. */
export function calcularVenda(venda: Venda, compras: Compra[]): VendaCalculada {
  const lote = compras.find(c => c.id === venda.idLote);
  const custoUnitarioReal = lote
    ? (lote.qtdComprada * lote.custoUnitario + lote.freteCompra + lote.outrosCustos)
        / Math.max(lote.qtdComprada, 1)
    : 0;

  const receitaBruta = venda.qtdVendida * venda.precoUnitario;
  const taxaValor = receitaBruta * venda.taxaPercentual;
  const receitaLiquida = receitaBruta - taxaValor - venda.freteVendedor - venda.desconto - venda.outrosCustos;
  const custoTotalProporcional = venda.qtdVendida * custoUnitarioReal;
  const lucroBruto = receitaBruta - custoTotalProporcional;
  const lucroLiquido = receitaLiquida - custoTotalProporcional;
  const margemLiquida = receitaBruta > 0 ? lucroLiquido / receitaBruta : 0;

  return {
    ...venda,
    receitaBruta,
    taxaValor,
    receitaLiquida,
    custoUnitarioReal,
    custoTotalProporcional,
    lucroBruto,
    lucroLiquido,
    margemLiquida,
  };
}

/** Calcula KPIs consolidados a partir das listas calculadas. */
export function calcularKpis(
  comprasCalc: CompraCalculada[],
  vendasCalc: VendaCalculada[],
): KpiResumo {
  const concluidas = vendasCalc.filter(v => v.status === 'Concluída');

  const totalInvestido = comprasCalc.reduce((s, c) => s + c.custoTotalReal, 0);
  const capitalParado = comprasCalc.reduce((s, c) => s + c.valorParado, 0);
  const receitaBruta = concluidas.reduce((s, v) => s + v.receitaBruta, 0);
  const taxasTotal = concluidas.reduce((s, v) => s + v.taxaValor, 0);
  const fretesTotal = concluidas.reduce((s, v) => s + v.freteVendedor, 0);
  const descontosTotal = concluidas.reduce((s, v) => s + v.desconto, 0);
  const receitaLiquida = concluidas.reduce((s, v) => s + v.receitaLiquida, 0);
  const lucroBruto = concluidas.reduce((s, v) => s + v.lucroBruto, 0);
  const lucroLiquido = concluidas.reduce((s, v) => s + v.lucroLiquido, 0);
  const margemLiquida = receitaBruta > 0 ? lucroLiquido / receitaBruta : 0;

  return {
    totalInvestido,
    capitalParado,
    receitaBruta,
    receitaLiquida,
    taxasTotal,
    fretesTotal,
    descontosTotal,
    lucroBruto,
    lucroLiquido,
    margemLiquida,
    qtdVendida: concluidas.reduce((s, v) => s + v.qtdVendida, 0),
    qtdLotes: comprasCalc.length,
    qtdLotesEstoque: comprasCalc.filter(c => c.estoqueAtual > 0).length,
    qtdLotesVendidos: comprasCalc.filter(c => c.estoqueAtual <= 0).length,
    ticketMedio: concluidas.length > 0
      ? concluidas.reduce((s, v) => s + v.precoUnitario, 0) / concluidas.length
      : 0,
  };
}

/** Gera o próximo ID sequencial para um prefixo (ex: C, V). */
export function proximoId(ids: string[], prefixo: string, padding = 3): string {
  let max = 0;
  const re = new RegExp(`^${prefixo}(\\d+)$`);
  for (const id of ids) {
    const m = id.match(re);
    if (m?.[1]) max = Math.max(max, parseInt(m[1], 10));
  }
  return prefixo + String(max + 1).padStart(padding, '0');
}
