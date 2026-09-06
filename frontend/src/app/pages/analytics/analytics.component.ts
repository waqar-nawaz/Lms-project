import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { Doctor, LabTest } from '../../core/models/models';

type Preset = 'today' | 'week' | 'month' | 'custom';

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './analytics.component.html',
  styleUrl: './analytics.component.scss',
})
export class AnalyticsComponent implements OnInit {
  doctors: Doctor[] = [];
  tests: LabTest[] = [];

  preset: Preset = 'month';
  fromDate = '';
  toDate = '';
  testId = '';
  doctorId = '';

  summary: any = null;
  loading = false;

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.api.getDoctors().subscribe((d) => (this.doctors = d));
    this.api.getTests().subscribe((t) => (this.tests = t));
    this.setPreset('month');
  }

  private isoDate(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  setPreset(preset: Preset) {
    this.preset = preset;
    const now = new Date();
    if (preset === 'today') {
      this.fromDate = this.isoDate(now);
      this.toDate = this.isoDate(now);
    } else if (preset === 'week') {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay());
      this.fromDate = this.isoDate(start);
      this.toDate = this.isoDate(now);
    } else if (preset === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      this.fromDate = this.isoDate(start);
      this.toDate = this.isoDate(now);
    }
    if (preset !== 'custom') this.apply();
  }

  apply() {
    this.loading = true;
    this.api
      .getAnalyticsSummary({
        from: this.fromDate || undefined,
        to: this.toDate ? this.toDate + 'T23:59:59' : undefined,
        test_id: this.testId || undefined,
        doctor_id: this.doctorId || undefined,
      })
      .subscribe({
        next: (s) => {
          this.summary = s;
          this.loading = false;
        },
        error: () => (this.loading = false),
      });
  }

  clearFilters() {
    this.testId = '';
    this.doctorId = '';
    this.setPreset('month');
  }
}
