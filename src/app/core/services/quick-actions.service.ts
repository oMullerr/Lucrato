import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Purchase, Sale } from '../models/models';
import { SaleFormDialogComponent } from '../../features/sales/sale-form.dialog';
import { PurchaseFormDialogComponent } from '../../features/purchases/purchase-form.dialog';
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
}
