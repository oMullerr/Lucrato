/**
 * O painel injetado no anúncio.
 *
 * Vive dentro de um Shadow DOM fechado: o CSS do Mercado Livre não entra e o
 * nosso não vaza. Sem isso, uma mudança de estilo deles quebraria o painel — ou
 * pior, o nosso estilo quebraria a página deles.
 *
 * A paleta acompanha a do app (cédula petróleo + champanhe) para você
 * reconhecer que é o Lucrato falando, não o Mercado Livre.
 */
import { AnaliseDoMl, Montagem, SeusNumeros, montarEntrada } from './analise';
import { DadosDaPagina } from './page';
import {
  calcular,
  custoMaximo,
  precoDeEquilibrio,
} from '../../src/app/core/pricing/pricing';

const brl = (v: number): string =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;

const ESTILO = `
  :host { all: initial; }
  .caixa {
    position: fixed; right: 16px; top: 96px; z-index: 2147483000;
    width: 320px; max-height: calc(100vh - 120px); overflow-y: auto;
    font: 14px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: #e8eceb; background: #0d1a18;
    border: 1px solid #234; border-radius: 14px;
    box-shadow: 0 12px 40px rgba(0,0,0,.45);
  }
  .cabeca {
    display: flex; align-items: center; gap: 8px;
    padding: 12px 14px; border-bottom: 1px solid #1d2f2c;
  }
  .marca { font-weight: 700; letter-spacing: .02em; color: #e7d6a8; flex: 1; }
  .fechar {
    all: unset; cursor: pointer; padding: 2px 6px; border-radius: 6px;
    color: #8fa5a1; font-size: 16px; line-height: 1;
  }
  .fechar:hover { background: #162927; color: #e8eceb; }
  .corpo { padding: 12px 14px; display: flex; flex-direction: column; gap: 12px; }
  .titulo { font-size: 12px; color: #8fa5a1; max-height: 2.9em; overflow: hidden; }
  .grade { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  label { display: block; font-size: 11px; color: #8fa5a1; margin-bottom: 3px; }
  input {
    all: unset; box-sizing: border-box; width: 100%;
    padding: 6px 8px; border: 1px solid #24403c; border-radius: 8px;
    background: #0a1413; color: #e8eceb; font-variant-numeric: tabular-nums;
  }
  input:focus { border-color: #3d7d72; }
  .destaque {
    display: flex; align-items: baseline; justify-content: space-between;
    padding: 10px 12px; border-radius: 10px; background: #112220;
    border: 1px solid #1d3b36;
  }
  .destaque .valor { font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .lucro { color: #6fd3a6; }
  .prejuizo { color: #f08a84; }
  dl { margin: 0; display: grid; grid-template-columns: 1fr auto; gap: 5px 10px; }
  dt { color: #8fa5a1; font-size: 12px; }
  dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; font-size: 12px; }
  .nota {
    font-size: 11px; color: #8fa5a1; display: flex; gap: 6px; align-items: flex-start;
    border-top: 1px solid #1d2f2c; padding-top: 10px;
  }
  .alerta { color: #e7c26a; }
  a { color: #7ec8b8; }
`;

export interface EstadoDoPainel {
  pagina: DadosDaPagina;
  analise: AnaliseDoMl | null;
  motivo?: 'sem_sessao' | 'sem_conta' | 'falhou';
  seus: SeusNumeros;
}

const AVISO: Record<string, string> = {
  sem_sessao:
    'Comissão estimada em 12%. Abra o Lucrato numa aba e faça login para usar a comissão real da sua categoria.',
  sem_conta:
    'Comissão estimada em 12%. Conecte sua conta do Mercado Livre no Lucrato para trazer a comissão real.',
  falhou:
    'Comissão estimada em 12%. Não deu para consultar o Mercado Livre agora.',
};

/** Campos numéricos do painel, em ordem de tela. */
const CAMPOS: { chave: keyof SeusNumeros; rotulo: string }[] = [
  { chave: 'custoProduto', rotulo: 'Custo do produto' },
  { chave: 'custosExtras', rotulo: 'Custos extras' },
  { chave: 'freteManual', rotulo: 'Frete (vazio = estimado)' },
  { chave: 'quantidade', rotulo: 'Quantidade' },
];

/**
 * Lê um número digitado em português.
 *
 * Os campos são de texto, e não `type="number"`, porque o campo numérico
 * descarta a vírgula: "7,5" chega vazio ao código e o custo vira zero sem que
 * ninguém perceba. `null` significa campo vazio — o que, no frete, é diferente
 * de zero.
 */
export function lerNumero(bruto: string): number | null {
  const t = (bruto ?? '').trim();
  if (!t) return null;

  // Com vírgula, o ponto é separador de milhar. Sem vírgula, um ponto sozinho
  // é o decimal que o teclado numérico produz.
  const normalizado = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const n = Number(normalizado);
  return isFinite(n) && n >= 0 ? n : null;
}

export class Painel {
  private readonly raiz: ShadowRoot;
  private readonly hospedeiro: HTMLElement;
  private estado: EstadoDoPainel;
  private aoMudar: (seus: SeusNumeros) => void = () => {};

  constructor(estado: EstadoDoPainel) {
    this.estado = estado;
    this.hospedeiro = document.createElement('div');
    this.hospedeiro.id = 'lucrato-painel';
    this.raiz = this.hospedeiro.attachShadow({ mode: 'closed' });
    document.body.appendChild(this.hospedeiro);
    this.desenhar();
  }

  /** Avisa quem hospeda que os números mudaram, para persistir. */
  onMudanca(fn: (seus: SeusNumeros) => void): void {
    this.aoMudar = fn;
  }

  atualizar(parcial: Partial<EstadoDoPainel>): void {
    this.estado = { ...this.estado, ...parcial };
    this.desenhar();
  }

  destruir(): void {
    this.hospedeiro.remove();
  }

  private montagem(): Montagem {
    return montarEntrada(this.estado.pagina.preco, this.estado.analise, this.estado.seus);
  }

  private desenhar(): void {
    const { entrada, procedencia } = this.montagem();
    const r = calcular(entrada);
    const equilibrio = precoDeEquilibrio(entrada);
    // Margem-alvo de 20%: a pergunta prática é quanto dá para pagar ao
    // fornecedor e ainda sair com uma margem que valha a operação.
    const teto = custoMaximo(entrada, 0.2);

    const seus = this.estado.seus;
    const aviso = procedencia.comissao === 'padrao' ? AVISO[this.estado.motivo ?? 'falhou'] : '';

    this.raiz.innerHTML = `
      <style>${ESTILO}</style>
      <section class="caixa" role="complementary" aria-label="Análise do Lucrato">
        <header class="cabeca">
          <span class="marca">Lucrato</span>
          <button class="fechar" title="Fechar" aria-label="Fechar">&times;</button>
        </header>
        <div class="corpo">
          <p class="titulo">${escapar(this.estado.pagina.titulo)}</p>

          <div class="grade">
            ${CAMPOS.map(c => campo(c, seus)).join('')}
          </div>

          <div class="destaque">
            <span>Lucro${entrada.quantidade > 1 ? ` (${entrada.quantidade}un)` : ''}</span>
            <span class="valor ${r.lucroLiquido >= 0 ? 'lucro' : 'prejuizo'}">
              ${brl(r.lucroLiquido)}
            </span>
          </div>

          <dl>
            <dt>Preço anunciado</dt><dd>${brl(entrada.precoVenda)}</dd>
            <dt>Comissão (${pct(entrada.comissaoPct)}${procedencia.comissao === 'padrao' ? ' est.' : ''})</dt>
            <dd>−${brl(r.comissao)}</dd>
            ${entrada.taxaFixa > 0 ? `<dt>Taxa fixa</dt><dd>−${brl(r.taxaFixaTotal)}</dd>` : ''}
            <dt>Frete${procedencia.frete === 'estimado' ? ' (est.)' : ''}</dt>
            <dd>−${brl(r.freteTotal)}</dd>
            <dt>Você recebe</dt><dd>${brl(r.valorRecebido)}</dd>
            <dt>Margem</dt><dd>${pct(r.margemContribuicao)}</dd>
            <dt>ROI</dt><dd>${seus.custoProduto > 0 ? pct(r.roi) : '—'}</dd>
            <dt>Preço de equilíbrio</dt><dd>${equilibrio === null ? '—' : brl(equilibrio)}</dd>
            <dt>Custo máx. p/ margem 20%</dt><dd>${brl(teto)}</dd>
          </dl>

          ${aviso ? `<p class="nota alerta">${escapar(aviso)}</p>` : ''}
          ${
            entrada.precoVenda === 0
              ? '<p class="nota alerta">Não deu para ler o preço desta página. Abra o anúncio pela página do produto.</p>'
              : ''
          }
        </div>
      </section>
    `;

    this.ligarEventos();
  }

  private ligarEventos(): void {
    this.raiz.querySelector('.fechar')?.addEventListener('click', () => this.destruir());

    for (const c of CAMPOS) {
      const input = this.raiz.querySelector<HTMLInputElement>(`input[name="${c.chave}"]`);
      input?.addEventListener('input', () => {
        const lido = lerNumero(input.value);
        // Frete vazio significa "use o estimado", não zero. Zero digitado é
        // uma escolha diferente (retirada em mãos) e precisa ser respeitada.
        const valor = c.chave === 'freteManual' ? lido : (lido ?? 0);

        const seus = { ...this.estado.seus, [c.chave]: valor } as SeusNumeros;
        this.estado = { ...this.estado, seus };
        this.aoMudar(seus);
        this.redesenharResultados();
      });
    }
  }

  /**
   * Recalcula sem refazer o HTML inteiro.
   *
   * Redesenhar tudo a cada tecla tiraria o foco do campo no meio da digitação.
   */
  private redesenharResultados(): void {
    const { entrada } = this.montagem();
    const r = calcular(entrada);
    const equilibrio = precoDeEquilibrio(entrada);
    const teto = custoMaximo(entrada, 0.2);

    const valor = this.raiz.querySelector<HTMLElement>('.destaque .valor');
    if (valor) {
      valor.textContent = brl(r.lucroLiquido);
      valor.className = `valor ${r.lucroLiquido >= 0 ? 'lucro' : 'prejuizo'}`;
    }

    const dds = this.raiz.querySelectorAll('dl dd');
    const linhas = [
      brl(entrada.precoVenda),
      `−${brl(r.comissao)}`,
      ...(entrada.taxaFixa > 0 ? [`−${brl(r.taxaFixaTotal)}`] : []),
      `−${brl(r.freteTotal)}`,
      brl(r.valorRecebido),
      pct(r.margemContribuicao),
      this.estado.seus.custoProduto > 0 ? pct(r.roi) : '—',
      equilibrio === null ? '—' : brl(equilibrio),
      brl(teto),
    ];
    dds.forEach((dd, i) => {
      if (linhas[i] !== undefined) dd.textContent = linhas[i];
    });

    const rotuloQtd = this.raiz.querySelector<HTMLElement>('.destaque span:first-child');
    if (rotuloQtd) {
      rotuloQtd.textContent = `Lucro${entrada.quantidade > 1 ? ` (${entrada.quantidade}un)` : ''}`;
    }
  }
}

function campo(c: { chave: keyof SeusNumeros; rotulo: string }, seus: SeusNumeros): string {
  const v = seus[c.chave];
  const valor = v === null || v === undefined ? '' : String(v);
  return `
    <div>
      <label for="l-${c.chave}">${c.rotulo}</label>
      <input id="l-${c.chave}" name="${c.chave}" type="text" inputmode="decimal"
             autocomplete="off" value="${escapar(valor)}">
    </div>
  `;
}

/** O título vem da página de terceiro: nunca entra como HTML. */
function escapar(texto: string): string {
  return (texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
