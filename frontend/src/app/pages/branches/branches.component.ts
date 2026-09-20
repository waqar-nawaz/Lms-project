import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-branches',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './branches.component.html',
  styleUrl: './branches.component.scss',
})
export class BranchesComponent implements OnInit {
  branches: any[] = [];
  showForm = false;
  editingId: string | null = null;
  submitted = false;
  saving = false;
  error = '';
  form = { name: '', code: '', address: '', phone: '', active: true };

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.api.getBranches().subscribe((rows) => (this.branches = rows));
  }

  openForm() {
    this.editingId = null;
    this.form = { name: '', code: '', address: '', phone: '', active: true };
    this.error = '';
    this.submitted = false;
    this.showForm = true;
  }

  openEditForm(b: any) {
    this.editingId = b.id;
    this.form = { name: b.name, code: b.code, address: b.address || '', phone: b.phone || '', active: b.active };
    this.error = '';
    this.submitted = false;
    this.showForm = true;
  }

  submit() {
    this.submitted = true;
    if (!this.form.name || !this.form.code) return;
    this.error = '';
    this.saving = true;

    const action = this.editingId ? this.api.updateBranch(this.editingId, this.form) : this.api.createBranch(this.form);
    action.subscribe({
      next: () => { this.saving = false; this.showForm = false; this.load(); },
      error: (err) => { this.saving = false; this.error = err.error?.error || 'Failed to save branch'; },
    });
  }

  toggleActive(b: any) {
    this.api.updateBranch(b.id, { name: b.name, code: b.code, address: b.address, phone: b.phone, active: !b.active }).subscribe(() => this.load());
  }
}
