import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

const ROLES = [
  'super_admin', 'lab_manager', 'receptionist', 'phlebotomist',
  'lab_technician', 'pathologist', 'accountant',
];

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './users.component.html',
  styleUrl: './users.component.scss',
})
export class UsersComponent implements OnInit {
  roles = ROLES;
  users: any[] = [];

  showForm = false;
  editingId: string | null = null;
  submitted = false;
  saving = false;
  error = '';

  form: any = this.emptyForm();

  constructor(private api: ApiService, public auth: AuthService) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.api.getUsers().subscribe((rows) => (this.users = rows));
  }

  emptyForm() {
    return { name: '', email: '', phone: '', password: '', role: 'receptionist' };
  }

  openForm() {
    this.editingId = null;
    this.form = this.emptyForm();
    this.error = '';
    this.submitted = false;
    this.showForm = true;
  }

  openEditForm(u: any) {
    this.editingId = u.id;
    this.form = { name: u.name, email: u.email, phone: u.phone || '', password: '', role: u.role, active: u.active };
    this.error = '';
    this.submitted = false;
    this.showForm = true;
  }

  submit() {
    this.submitted = true;

    if (this.editingId) {
      this.error = '';
      this.saving = true;
      const payload: any = { name: this.form.name, phone: this.form.phone, role: this.form.role, active: this.form.active };
      if (this.form.password) payload.password = this.form.password;
      this.api.updateUser(this.editingId, payload).subscribe({
        next: () => { this.saving = false; this.showForm = false; this.load(); },
        error: (err) => { this.saving = false; this.error = err.error?.error || 'Failed to update user'; },
      });
      return;
    }

    if (!this.form.name || !this.form.email || !this.form.password || !this.form.role) {
      this.error = 'Please fill all required fields';
      return;
    }
    if (this.form.password.length < 8) {
      this.error = 'Password must be at least 8 characters';
      return;
    }
    this.error = '';
    this.saving = true;
    this.api.createUser(this.form).subscribe({
      next: () => { this.saving = false; this.showForm = false; this.load(); },
      error: (err) => { this.saving = false; this.error = err.error?.error || 'Failed to create user'; },
    });
  }

  toggleActive(u: any) {
    const action = u.active ? 'deactivate' : 'reactivate';
    if (!confirm(`${action === 'deactivate' ? 'Deactivate' : 'Reactivate'} ${u.name}'s account?`)) return;
    this.api.updateUser(u.id, { active: !u.active }).subscribe(() => this.load());
  }
}
