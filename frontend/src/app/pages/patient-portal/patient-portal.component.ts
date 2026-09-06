import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-patient-portal',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './patient-portal.component.html',
  styleUrl: './patient-portal.component.scss',
})
export class PatientPortalComponent {
  identifier = '';
  dob = '';
  submitted = false;
  loading = false;
  error = '';
  result: { patient: any; reports: any[] } | null = null;

  constructor(private api: ApiService) {}

  search() {
    this.submitted = true;
    this.error = '';
    if (!this.identifier || !this.dob) return;

    this.loading = true;
    this.result = null;
    this.api.patientPortalLookup(this.identifier, this.dob).subscribe({
      next: (res) => {
        this.loading = false;
        this.result = res;
      },
      error: (err) => {
        this.loading = false;
        this.error = err.error?.error || 'Something went wrong. Please try again.';
      },
    });
  }

  download(reportId: string, reportNumber: string) {
    this.api.patientPortalDownload(reportId, this.identifier, this.dob).subscribe((blob) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reportNumber}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    });
  }

  searchAgain() {
    this.result = null;
    this.submitted = false;
    this.identifier = '';
    this.dob = '';
  }
}
