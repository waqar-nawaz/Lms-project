import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { Invoice, Order, ResultRow } from '../../core/models/models';

@Component({
  selector: 'app-order-detail',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './order-detail.component.html',
  styleUrl: './order-detail.component.scss',
})
export class OrderDetailComponent implements OnInit {
  orderId = '';
  order: Order | null = null;
  results: ResultRow[] = [];
  reports: any[] = [];
  invoice: Invoice | null = null;

  resultDrafts: Record<string, string> = {};
  amendmentReason: Record<string, string> = {};
  rejectReasonFor: string | null = null;
  rejectReason = '';
  paymentAmount = 0;
  paymentMethod = 'cash';
  message = '';
  error = '';

  readonly rejectionReasons = [
    'insufficient_volume', 'hemolyzed', 'clotted', 'wrong_container', 'leaking_container',
    'mislabelled', 'unlabelled', 'delayed_transport', 'contaminated', 'incorrect_specimen_type',
  ];

  constructor(private api: ApiService, private route: ActivatedRoute, public auth: AuthService) {}

  ngOnInit() {
    this.orderId = this.route.snapshot.params['id'];
    this.loadAll();
  }

  loadAll() {
    this.api.getOrder(this.orderId).subscribe((o) => (this.order = o));
    this.api.getResultsWorklist(this.orderId).subscribe((rows) => (this.results = rows));
    this.api.getReports(this.orderId).subscribe((r) => (this.reports = r));
  }

  flash(msg: string) {
    this.message = msg;
    setTimeout(() => (this.message = ''), 3000);
  }

  showError(err: any) {
    this.error = err.error?.error || 'Something went wrong';
    setTimeout(() => (this.error = ''), 4000);
  }

  // --- Specimens ---
  generateSpecimens() {
    this.api.generateSpecimens(this.orderId).subscribe({
      next: () => { this.flash('Specimens generated'); this.loadAll(); },
      error: (e) => this.showError(e),
    });
  }

  collect(specimenId: string) {
    this.api.collectSpecimen(specimenId).subscribe({
      next: () => { this.flash('Specimen collected'); this.loadAll(); },
      error: (e) => this.showError(e),
    });
  }

  receive(specimenId: string) {
    this.api.receiveSpecimen(specimenId).subscribe({
      next: () => { this.flash('Specimen accessioned'); this.loadAll(); },
      error: (e) => this.showError(e),
    });
  }

  openReject(specimenId: string) {
    this.rejectReasonFor = specimenId;
    this.rejectReason = this.rejectionReasons[0];
  }

  confirmReject() {
    if (!this.rejectReasonFor) return;
    this.api.rejectSpecimen(this.rejectReasonFor, this.rejectReason).subscribe({
      next: () => { this.flash('Specimen rejected'); this.rejectReasonFor = null; this.loadAll(); },
      error: (e) => this.showError(e),
    });
  }

  // --- Results ---
  saveResult(row: ResultRow) {
    const value = this.resultDrafts[row.parameter_id] ?? row.value;
    if (value === undefined || value === null || value === '') return;
    this.api
      .enterResult({
        order_item_id: row.order_item_id,
        parameter_id: row.parameter_id,
        value: String(value),
        amendment_reason: this.amendmentReason[row.parameter_id] || undefined,
      })
      .subscribe({
        next: (res) => {
          this.flash(res.critical ? 'Result saved — CRITICAL value flagged' : 'Result saved');
          this.loadAll();
        },
        error: (e) => this.showError(e),
      });
  }

  verify(resultId: string) {
    this.api.verifyResult(resultId).subscribe({
      next: () => { this.flash('Result verified'); this.loadAll(); },
      error: (e) => this.showError(e),
    });
  }

  // --- Billing ---
  createInvoice() {
    this.api.createInvoice(this.orderId).subscribe({
      next: (inv) => { this.invoice = inv; this.flash('Invoice created'); },
      error: (e) => this.showError(e),
    });
  }

  loadInvoice() {
    if (!this.invoice) return;
    this.api.getInvoice(this.invoice.id).subscribe((inv) => (this.invoice = inv));
  }

  recordPayment() {
    if (!this.invoice || !this.paymentAmount) return;
    this.api.recordPayment(this.invoice.id, { amount: this.paymentAmount, method: this.paymentMethod }).subscribe({
      next: () => { this.flash('Payment recorded'); this.paymentAmount = 0; this.loadInvoice(); this.loadAll(); },
      error: (e) => this.showError(e),
    });
  }

  // --- Reports ---
  generateReport() {
    this.api.generateReport(this.orderId).subscribe({
      next: () => { this.flash('Report generated'); this.loadAll(); },
      error: (e) => this.showError(e),
    });
  }

  download(id: string, reportNumber: string) {
    this.api.downloadReport(id).subscribe((blob) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reportNumber}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    });
  }
}
