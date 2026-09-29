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

  // ---- Levey-Jennings chart (inline SVG, no chart library) ----
  readonly chartW = 640;
  readonly chartH = 260;
  readonly padL = 44;
  readonly padR = 12;
  readonly padT = 12;
  readonly padB = 24;

  // y position for a z-score, clamped to the ±4 SD plotting range
  yForZ(z: number): number {
    const zc = Math.max(-4, Math.min(4, z));
    const inner = this.chartH - this.padT - this.padB;
    return this.padT + ((4 - zc) / 8) * inner;
  }

  xForIndex(i: number, n: number): number {
    const inner = this.chartW - this.padL - this.padR;
    return n <= 1 ? this.padL + inner / 2 : this.padL + (i / (n - 1)) * inner;
  }

  get sdLines() {
    const m = Number(this.resultsFor?.target_mean);
    const sd = Number(this.resultsFor?.target_sd);
    return [-3, -2, -1, 0, 1, 2, 3].map((z) => ({
      z,
      y: this.yForZ(z),
      label: z === 0 ? 'Mean' : `${z > 0 ? '+' : ''}${z}SD`,
      value: (m + z * sd).toFixed(2),
      cls: z === 0 ? 'lj-mean' : Math.abs(z) === 3 ? 'lj-3sd' : Math.abs(z) === 2 ? 'lj-2sd' : 'lj-1sd',
    }));
  }

  get chartPoints() {
    const m = Number(this.resultsFor?.target_mean);
    const sd = Number(this.resultsFor?.target_sd);
    const n = this.results.length;
    return this.results.map((r, i) => {
      const z = (Number(r.value) - m) / sd;
      return {
        x: this.xForIndex(i, n),
        y: this.yForZ(z),
        z,
        cls: Math.abs(z) > 3 ? 'lj-pt-reject' : Math.abs(z) > 2 ? 'lj-pt-warn' : 'lj-pt-ok',
        title: `${new Date(r.performed_at).toLocaleString()} — ${r.value} (z=${z.toFixed(2)})${r.westgard_violation ? ' — ' + r.westgard_violation : ''}`,
      };
    });
  }

  get chartPath(): string {
    return this.chartPoints.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
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
