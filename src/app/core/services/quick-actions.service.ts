import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Purchase, Sale } from '../models/models';
import { SaleFormDialogComponent } from '../../features/sales/sale-form.dialog';
import { PurchaseFormDialogComponent } from '../../features/purchases/purchase-form.dialog';
import {
  ConfirmDialogComponent,
  ConfirmDialogResult,
} from '../../shared/components/confirm-dialog.component';
import { DataService } from './data.service';
import { NotifyService } from './notify.service';

@Injectable({ providedIn: 'root' })
export class QuickActionsService {
  private readonly dialog = inject(MatDialog);
  private readonly data = inject(DataService);
  private readonly notify = inject(NotifyService);

  openNewSale(): void {
    this.dialog
      .open<SaleFormDialogComponent, { sale?: Sale }, Sale | null>(
        SaleFormDialogComponent,
        { data: {}, width: '820px', maxWidth: '95vw' },
      )
      .afterClosed()
      .subscribe(result => {
        if (!result) return;
        if (this.data.findSale(result.id)) {
          this.notify.error(`ID ${result.id} já existe.`);
          return;
        }
        this.data.addSale(result);
        this.notify.success(`Venda ${result.id} registrada.`);
      });
  }

  openNewPurchase(): void {
    this.dialog
      .open<PurchaseFormDialogComponent, { purchase?: Purchase }, Purchase | null>(
        PurchaseFormDialogComponent,
        { data: {}, width: '720px', maxWidth: '95vw' },
      )
      .afterClosed()
      .subscribe(result => {
        if (!result) return;
        if (this.data.findPurchase(result.id)) {
          this.notify.error(`ID ${result.id} já existe.`);
          return;
        }
        this.data.addPurchase(result);
        this.notify.success(`Lote ${result.id} adicionado.`);
      });
  }

  /**
   * Marks a batch as received today (after confirmation), flipping it from
   * "Em trânsito" to "Em Estoque". No-op if the batch already has a receipt date.
   */
  markReceivedToday(purchase: Purchase): void {
    if (purchase.receiptDate) return;

    const today = todayLocalISO();
    this.dialog
      .open<ConfirmDialogComponent, unknown, ConfirmDialogResult>(ConfirmDialogComponent, {
        width: '420px',
        data: {
          title: 'Marcar como recebido?',
          message: `O lote ${purchase.id} (${purchase.product}) será marcado como recebido hoje (${formatBrDate(today)}). O tempo de estoque passa a contar a partir de hoje.`,
          confirmText: 'Marcar recebido',
          danger: false,
        },
      })
      .afterClosed()
      .subscribe(result => {
        if (!result || !result.confirmed) return;
        this.data.updatePurchase(purchase.id, { receiptDate: today });
        this.notify.success(`Lote ${purchase.id} marcado como recebido hoje.`);
      });
  }
}

/** Today's date as a local `YYYY-MM-DD` string (avoids UTC off-by-one near midnight). */
function todayLocalISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Formats a `YYYY-MM-DD` string as `DD/MM/YYYY` for display. */
function formatBrDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
