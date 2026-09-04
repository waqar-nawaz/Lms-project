import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { Doctor, LabTest, Order, Patient } from '../../core/models/models';

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './orders.component.html',
  styleUrl: './orders.component.scss',
})
export class OrdersComponent implements OnInit {
  orders: Order[] = [];
  statusFilter = '';

  showForm = false;
  patient: Patient | null = null;
  doctors: Doctor[] = [];
  tests: LabTest[] = [];
  selectedTestIds = new Set<string>();
  doctorId = '';
  priority = 'routine';
  discount = 0;
  notes = '';
  saving = false;
  error = '';
  submitted = false;

  constructor(private api: ApiService, private route: ActivatedRoute, private router: Router) {}

  ngOnInit() {
    this.load();
    this.api.getDoctors().subscribe((d) => (this.doctors = d));
    this.api.getTests().subscribe((t) => (this.tests = t));

    this.route.queryParams.subscribe((params) => {
      if (params['newFor']) {
        this.api.getPatient(params['newFor']).subscribe((p) => {
          this.patient = p;
          this.showForm = true;
        });
      }
    });
  }

  load() {
    this.api.getOrders(this.statusFilter || undefined).subscribe((rows) => (this.orders = rows));
  }

  get subtotal(): number {
    return this.tests
      .filter((t) => this.selectedTestIds.has(t.id))
      .reduce((sum, t) => sum + Number(t.price), 0);
  }

  toggleTest(id: string) {
    if (this.selectedTestIds.has(id)) this.selectedTestIds.delete(id);
    else this.selectedTestIds.add(id);
  }

  submit() {
    this.submitted = true;
    if (!this.patient || !this.selectedTestIds.size) {
      this.error = !this.selectedTestIds.size ? 'Select at least one test' : '';
      return;
    }
    this.error = '';
    this.saving = true;
    this.api
      .createOrder({
        patient_id: this.patient.id,
        doctor_id: this.doctorId || undefined,
        priority: this.priority,
        notes: this.notes || undefined,
        discount: this.discount || 0,
        test_ids: Array.from(this.selectedTestIds),
      })
      .subscribe({
        next: (order) => {
          this.saving = false;
          this.router.navigate(['/orders', order.id]);
        },
        error: (err) => {
          this.saving = false;
          this.error = err.error?.error || 'Failed to create order';
        },
      });
  }

  cancelForm() {
    this.showForm = false;
    this.router.navigate(['/orders']);
  }
}
