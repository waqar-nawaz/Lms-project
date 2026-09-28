import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.scss',
})
export class ForgotPasswordComponent {
  email = '';
  submitted = false;
  loading = false;
  done = false;
  message = '';

  constructor(private api: ApiService) {}

  submit() {
    this.submitted = true;
    if (!this.email) return;
    this.loading = true;
    this.api.forgotPassword(this.email).subscribe({
      next: (res) => {
        this.loading = false;
        this.done = true;
        this.message = res.message;
      },
      error: () => {
        this.loading = false;
        this.done = true;
        this.message = 'If that email is registered, a reset link has been sent.';
      },
    });
  }
}
