import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-departments',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './departments.component.html',
  styleUrl: './departments.component.scss',
})
export class DepartmentsComponent implements OnInit {
  departments: any[] = [];
  showForm = false;
  editingId: string | null = null;
  submitted = false;
  saving = false;
  error = '';

  form = { name: '', code: '', active: true };

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.api.getAllDepartments().subscribe((rows) => (this.departments = rows));
  }

  openForm() {
    this.editingId = null;
    this.form = { name: '', code: '', active: true };
    this.error = '';
    this.submitted = false;
    this.showForm = true;
  }

  openEditForm(d: any) {
    this.editingId = d.id;
    this.form = { name: d.name, code: d.code, active: d.active };
    this.error = '';
    this.submitted = false;
    this.showForm = true;
  }

  submit() {
    this.submitted = true;
    if (!this.form.name || !this.form.code) return;
    this.error = '';
    this.saving = true;

    const action = this.editingId
      ? this.api.updateDepartment(this.editingId, this.form)
      : this.api.createDepartment(this.form);

    action.subscribe({
      next: () => { this.saving = false; this.showForm = false; this.load(); },
      error: (err) => { this.saving = false; this.error = err.error?.error || 'Failed to save department'; },
    });
  }

  toggleActive(d: any) {
    this.api.updateDepartment(d.id, { name: d.name, code: d.code, active: !d.active }).subscribe(() => this.load());
  }
}
