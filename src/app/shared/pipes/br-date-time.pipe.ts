import { Pipe, PipeTransform } from '@angular/core';
import { FUSO_VENDEDOR } from '../../core/ml/order-mapping';

/**
 * Instante completo em horário de Brasília: `11/09/2026 19:54`.
 *
 * Existe separado do `brDate` porque os dois recebem coisas diferentes. O
 * `brDate` recebe um dia já truncado (`2026-09-11`) e por isso formata em UTC —
 * o que está certo para ele e **errado** aqui: um instante passado por lá
 * mostraria o dia seguinte para qualquer liberação depois das 21h.
 *
 * O fuso é o mesmo `FUSO_VENDEDOR` que decide em que dia o recebível cai, para
 * a hora nunca discordar do dia embaixo do qual ela aparece. E converter é
 * obrigatório: o Mercado Pago devolve com o offset dele (`-04:00`), então ler a
 * string crua mostraria 18:54 onde o relógio do vendedor diz 19:54.
 */
@Pipe({ name: 'brDateTime', standalone: true, pure: true })
export class BrDateTimePipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) return '—';
    const date = new Date(value);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: FUSO_VENDEDOR,
    });
  }
}
