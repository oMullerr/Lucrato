import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'brl', standalone: true, pure: true })
export class BrlPipe implements PipeTransform {
  transform(value: number | null | undefined, hideZero = false): string {
    if (value === null || value === undefined) return '—';
    if (hideZero && value === 0) return '—';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  }
}
