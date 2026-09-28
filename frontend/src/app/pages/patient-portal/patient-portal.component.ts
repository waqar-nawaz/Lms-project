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
  useOtp = false;

  identifier = '';
  dob = '';
  submitted = false;
  loading = false;
  error = '';
  result: { patient: any; reports: any[] } | null = null;

  otpPhone = '';
  otpCode = '';
  otpRequested = false;
  otpSubmitted = false;
  otpLoading = false;
  otpError = '';
  otpInfo = '';

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

  requestOtp() {
    this.otpError = '';
    if (!this.otpPhone) {
      this.otpSubmitted = true;
      return;
    }
    this.otpLoading = true;
    this.api.requestPatientOtp(this.otpPhone).subscribe({
      next: (res) => {
        this.otpLoading = false;
        this.otpRequested = true;
        this.otpSubmitted = false;
        this.otpInfo = res.message;
      },
      error: (err) => {
        this.otpLoading = false;
        this.otpError = err.error?.error || 'Failed to send code.';
      },
    });
  }

  verifyOtp() {
    this.otpSubmitted = true;
    if (!this.otpCode) return;
    this.otpError = '';
    this.otpLoading = true;
    this.api.verifyPatientOtp(this.otpPhone, this.otpCode).subscribe({
      next: (res) => {
        this.otpLoading = false;
        this.identifier = this.otpPhone;
        this.dob = String(res.dob).slice(0, 10);
        this.result = { patient: res.patient, reports: res.reports };
      },
      error: (err) => {
        this.otpLoading = false;
        this.otpError = err.error?.error || 'Invalid or expired code.';
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
    this.otpRequested = false;
    this.otpSubmitted = false;
    this.otpPhone = '';
    this.otpCode = '';
    this.otpError = '';
  }
}
