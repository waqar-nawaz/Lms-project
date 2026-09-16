import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { LabTest } from '../../core/models/models';

@Component({
  selector: 'app-packages',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './packages.component.html',
  styleUrl: './packages.component.scss',
})
export class PackagesComponent implements OnInit {
  packages: any[] = [];
  tests: LabTest[] = [];

  showForm = false;
  editingId: string | null = null;
  submitted = false;
  saving = false;
  error = '';

  form: any = this.emptyForm();
  selectedTestIds = new Set<string>();

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.load();
    this.api.getTests().subscribe((t) => (this.tests = t));
  }

  load() {
    this.api.getPackages().subscribe((rows) => (this.packages = rows));
  }

  emptyForm() {
    return { name: '', price: 0, active: true };
  }

  get memberTotal(): number {
    return this.tests
      .filter((t) => this.selectedTestIds.has(t.id))
      .reduce((sum, t) => sum + Number(t.price), 0);
  }

  openForm() {
    this.editingId = null;
    this.form = this.emptyForm();
    this.selectedTestIds = new Set();
    this.error = '';
    this.submitted = false;
    this.showForm = true;
  }

  openEditForm(p: any) {
    this.editingId = p.id;
    this.form = { name: p.name, price: p.price, active: p.active };
    this.selectedTestIds = new Set(p.tests.map((t: any) => t.id));
    this.error = '';
    this.submitted = false;
    this.showForm = true;
  }

  toggleTest(id: string) {
    if (this.selectedTestIds.has(id)) this.selectedTestIds.delete(id);
    else this.selectedTestIds.add(id);
  }

  submit() {
    this.submitted = true;
    if (!this.form.name || !this.selectedTestIds.size) {
      this.error = 'Name and at least one test are required';
      return;
    }
    this.error = '';
    this.saving = true;

    const payload = { ...this.form, test_ids: Array.from(this.selectedTestIds) };
    const action = this.editingId ? this.api.updatePackage(this.editingId, payload) : this.api.createPackage(payload);

    action.subscribe({
      next: () => { this.saving = false; this.showForm = false; this.load(); },
      error: (err) => { this.saving = false; this.error = err.error?.error || 'Failed to save package'; },
    });
  }

  toggleActive(p: any) {
    this.api.updatePackage(p.id, { name: p.name, price: p.price, active: !p.active }).subscribe(() => this.load());
  }
}
