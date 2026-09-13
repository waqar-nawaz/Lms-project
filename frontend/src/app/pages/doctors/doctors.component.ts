import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { Doctor } from '../../core/models/models';

@Component({
  selector: 'app-doctors',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './doctors.component.html',
  styleUrl: './doctors.component.scss',
})
export class DoctorsComponent implements OnInit {
  doctors: Doctor[] = [];
  showForm = false;
  editingId: string | null = null;
  submitted = false;
  saving = false;
  error = '';

  form: Partial<Doctor> = this.emptyForm();

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.api.getDoctors(true).subscribe((rows) => (this.doctors = rows));
  }

  emptyForm(): Partial<Doctor> {
    return { name: '', specialty: '', phone: '', email: '', license_number: '', active: true };
  }

  openForm() {
    this.editingId = null;
    this.form = this.emptyForm();
    this.error = '';
    this.submitted = false;
    this.showForm = true;
  }

  openEditForm(d: Doctor) {
    this.editingId = d.id;
    this.form = { ...d };
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
      ? this.api.updateDoctor(this.editingId, this.form)
      : this.api.createDoctor(this.form);

    action.subscribe({
      next: () => { this.saving = false; this.showForm = false; this.load(); },
      error: (err) => { this.saving = false; this.error = err.error?.error || 'Failed to save doctor'; },
    });
  }

  toggleActive(d: Doctor) {
    this.api.updateDoctor(d.id, { ...d, active: !d.active }).subscribe(() => this.load());
  }
}
