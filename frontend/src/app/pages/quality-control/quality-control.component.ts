import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { LabTest } from '../../core/models/models';

@Component({
  selector: 'app-quality-control',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './quality-control.component.html',
  styleUrl: './quality-control.component.scss',
})
export class QualityControlComponent implements OnInit {
  materials: any[] = [];
  tests: LabTest[] = [];

  showForm = false;
  submitted = false;
  saving = false;
  error = '';
  form: any = this.emptyForm();

  resultsFor: any = null;
  results: any[] = [];
  newValue: number | null = null;
  resultError = '';

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.load();
    this.api.getTests().subscribe((t) => (this.tests = t));
  }

  load() {
    this.api.getQcMaterials().subscribe((rows) => (this.materials = rows));
  }

  emptyForm() {
    return { parameter_id: '', name: '', level: 'Level 1', target_mean: null, target_sd: null };
  }

  openForm() {
    this.form = this.emptyForm();
    this.error = '';
    this.submitted = false;
    this.showForm = true;
  }

  submit() {
    this.submitted = true;
    if (!this.form.parameter_id || !this.form.name || this.form.target_mean === null || this.form.target_sd === null) {
      this.error = 'Please fill all required fields';
      return;
    }
    this.error = '';
    this.saving = true;
    this.api.createQcMaterial(this.form).subscribe({
      next: () => { this.saving = false; this.showForm = false; this.load(); },
      error: (err) => { this.saving = false; this.error = err.error?.error || 'Failed to save'; },
    });
  }

  openResults(m: any) {
    this.resultsFor = m;
    this.newValue = null;
    this.resultError = '';
    this.api.getQcResults(m.id).subscribe((rows) => (this.results = rows));
  }

  closeResults() {
    this.resultsFor = null;
    this.results = [];
  }

  submitResult() {
    if (this.newValue === null) {
      this.resultError = 'Enter a value';
      return;
    }
    this.resultError = '';
    this.api.recordQcResult(this.resultsFor.id, this.newValue).subscribe({
      next: (res) => {
        this.newValue = null;
        this.openResults(this.resultsFor);
        if (res.westgard_violation) {
          this.resultError = `⚠ ${res.westgard_violation}`;
        }
      },
      error: (err) => (this.resultError = err.error?.error || 'Failed to record'),
    });
  }
}
