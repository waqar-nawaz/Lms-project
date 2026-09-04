import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { Patient } from '../../core/models/models';

@Component({
  selector: 'app-patients',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './patients.component.html',
  styleUrl: './patients.component.scss',
})
export class PatientsComponent implements OnInit {
  patients: Patient[] = [];
  query = '';
  showForm = false;
  saving = false;
  duplicates: Patient[] = [];
  error = '';
  submitted = false;

  form: Partial<Patient> = this.emptyForm();

  constructor(private api: ApiService, private router: Router) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.api.searchPatients(this.query).subscribe((rows) => (this.patients = rows));
  }

  emptyForm(): Partial<Patient> {
    return { mrn: '', first_name: '', last_name: '', gender: 'male' };
  }

  openForm() {
    this.form = this.emptyForm();
    this.form.mrn = 'MRN-' + Math.floor(100000 + Math.random() * 900000);
    this.duplicates = [];
    this.error = '';
    this.submitted = false;
    this.showForm = true;
  }

  submit() {
    this.submitted = true;
    this.error = '';
    if (!this.form.mrn || !this.form.first_name) return;

    this.saving = true;
    this.api.createPatient(this.form).subscribe({
      next: (res) => {
        this.saving = false;
        this.duplicates = res.possible_duplicates;
        if (!this.duplicates.length) {
          this.showForm = false;
          this.load();
        }
      },
      error: (err) => {
        this.saving = false;
        this.error = err.error?.error || 'Failed to create patient';
      },
    });
  }

  confirmDespiteDuplicates() {
    this.showForm = false;
    this.duplicates = [];
    this.load();
  }

  startOrder(patient: Patient) {
    this.router.navigate(['/orders'], { queryParams: { newFor: patient.id } });
  }
}
