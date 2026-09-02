import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { DialogService } from '../../shared/ui/dialog/dialog.service';
import { Purchase, Sale, Return } from '../models/models';
import { SaleFormDialogComponent } from '../../features/sales/sale-form.dialog';
import { ReturnFormDialogComponent, ReturnDialogData } from '../../features/returns/return-form.dialog';
import { PurchaseFormDialogComponent } from '../../features/purchases/purchase-form.dialog';
import {
  ConfirmDialogComponent,
  ConfirmDialogResult,
} from '../../shared/components/confirm-dialog.component';
import { DataService } from './data.service';
import { NotifyService } from './notify.service';

@Injectable({ providedIn: 'root' })
export class QuickActionsService {
  private readonly dialog = inject(DialogService);
  private readonly data = inject(DataService);
  private readonly notify = inject(NotifyService);
  private readonly t = inject(TranslateService);

  openNewSale(): void {
    this.dialog
      .open<SaleFormDialogComponent, { sale?: Sale }, Sale | null>(
        SaleFormDialogComponent,
        { data: {}, size: 'xl' },
      )
      .afterClosed()
      .subscribe(result => {
        if (!result) return;
        if (this.data.findSale(result.id)) {
          this.notify.error(this.t.instant('sales.idExists', { id: result.id }));
          return;
        }
        this.data.addSale(result);
        this.notify.success(this.t.instant('sales.registered', { id: result.id }));
      });
  }

  /** @param saleId pré-seleciona a venda (ação de linha da tela de Vendas). */
  openNewReturn(saleId?: string): void {
    this.dialog
      .open<ReturnFormDialogComponent, ReturnDialogData, Return | null>(
        ReturnFormDialogComponent,
        { data: { saleId }, size: 'xl' },
      )
      .afterClosed()
      .subscribe(result => {
        if (!result) return;
        if (this.data.findReturn(result.id)) {
          this.notify.error(this.t.instant('returns.idExists', { id: result.id }));
          return;
        }
        this.data.addReturn(result);
        this.notify.success(this.t.instant('returns.registered', { id: result.id }));
      });
  }

  openNewPurchase(): void {
    this.dialog
      .open<PurchaseFormDialogComponent, { purchase?: Purchase }, Purchase | null>(
        PurchaseFormDialogComponent,
        { data: {}, size: 'lg' },
      )
      .afterClosed()
      .subscribe(result => {
        if (!result) return;
        if (this.data.findPurchase(result.id)) {
          this.notify.error(this.t.instant('purchases.idExists', { id: result.id }));
          return;
        }
        this.data.addPurchase(result);
        this.notify.success(this.t.instant('purchases.added', { id: result.id }));
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
        size: 'sm',
        data: {
          title: this.t.instant('quick.markReceivedTitle'),
          message: this.t.instant('quick.markReceivedMsg', {
            id: purchase.id,
            product: purchase.product,
            date: formatBrDate(today),
          }),
          confirmText: this.t.instant('batchPanel.markReceived'),
          danger: false,
        },
      })
      .afterClosed()
      .subscribe(result => {
        if (!result || !result.confirmed) return;
        this.data.updatePurchase(purchase.id, { receiptDate: today });
        this.notify.success(this.t.instant('quick.markedReceived', { id: purchase.id }));
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
