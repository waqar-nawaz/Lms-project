import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.scss',
})
export class ResetPasswordComponent {
  token = '';
  password = '';
  confirm = '';
  submitted = false;
  loading = false;
  done = false;
  error = '';

  constructor(private api: ApiService, private route: ActivatedRoute, private router: Router) {
    this.token = this.route.snapshot.params['token'];
  }

  submit() {
    this.submitted = true;
    this.error = '';
    if (!this.password || this.password.length < 8) {
      this.error = 'Password must be at least 8 characters';
      return;
    }
    if (this.password !== this.confirm) {
      this.error = 'Passwords do not match';
      return;
    }
    this.loading = true;
    this.api.resetPassword(this.token, this.password).subscribe({
      next: () => {
        this.loading = false;
        this.done = true;
        setTimeout(() => this.router.navigate(['/login']), 2500);
      },
      error: (err) => {
        this.loading = false;
        this.error = err.error?.error || 'This reset link is invalid or has expired.';
      },
    });
  }
}
