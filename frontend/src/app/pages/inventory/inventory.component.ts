import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './inventory.component.html',
  styleUrl: './inventory.component.scss',
})
export class InventoryComponent implements OnInit {
  items: any[] = [];
  alerts: any[] = [];

  showForm = false;
  editingId: string | null = null;
  submitted = false;
  saving = false;
  error = '';
  form: any = this.emptyForm();

  txnFor: any = null;
  txnType = 'restock';
  txnQuantity: number | null = null;
  txnNotes = '';
  txnError = '';
  transactions: any[] = [];

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.api.getInventoryItems().subscribe((rows) => (this.items = rows));
    this.api.getInventoryAlerts().subscribe((rows) => (this.alerts = rows));
  }

  emptyForm() {
    return { name: '', category: '', unit: '', reorder_level: 0, current_stock: 0, expiry_date: '' };
  }

  openForm() {
    this.editingId = null;
    this.form = this.emptyForm();
    this.error = '';
    this.submitted = false;
    this.showForm = true;
  }

  openEditForm(i: any) {
    this.editingId = i.id;
    this.form = { ...i, expiry_date: i.expiry_date ? String(i.expiry_date).slice(0, 10) : '' };
    this.error = '';
    this.submitted = false;
    this.showForm = true;
  }

  submit() {
    this.submitted = true;
    if (!this.form.name) return;
    this.error = '';
    this.saving = true;

    const action = this.editingId
      ? this.api.updateInventoryItem(this.editingId, this.form)
      : this.api.createInventoryItem(this.form);

    action.subscribe({
      next: () => { this.saving = false; this.showForm = false; this.load(); },
      error: (err) => { this.saving = false; this.error = err.error?.error || 'Failed to save item'; },
    });
  }

  openTransaction(item: any) {
    this.txnFor = item;
    this.txnType = 'restock';
    this.txnQuantity = null;
    this.txnNotes = '';
    this.txnError = '';
    this.api.getInventoryTransactions(item.id).subscribe((rows) => (this.transactions = rows));
  }

  closeTransaction() {
    this.txnFor = null;
    this.transactions = [];
  }

  submitTransaction() {
    if (!this.txnQuantity || this.txnQuantity <= 0) {
      this.txnError = 'Enter a valid quantity';
      return;
    }
    this.txnError = '';
    this.api
      .recordInventoryTransaction(this.txnFor.id, { type: this.txnType, quantity: this.txnQuantity, notes: this.txnNotes })
      .subscribe({
        next: () => { this.closeTransaction(); this.load(); },
        error: (err) => (this.txnError = err.error?.error || 'Transaction failed'),
      });
  }

  isLow(item: any): boolean {
    return Number(item.current_stock) <= Number(item.reorder_level);
  }
}
