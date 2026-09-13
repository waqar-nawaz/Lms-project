import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent) },
  { path: 'portal', loadComponent: () => import('./pages/patient-portal/patient-portal.component').then(m => m.PatientPortalComponent) },
  { path: 'verify/:token', loadComponent: () => import('./pages/report-verify/report-verify.component').then(m => m.ReportVerifyComponent) },
  {
    path: '',
    loadComponent: () => import('./pages/shell/shell.component').then(m => m.ShellComponent),
    canActivate: [authGuard],
    children: [
      { path: 'dashboard', loadComponent: () => import('./pages/dashboard/dashboard.component').then(m => m.DashboardComponent) },
      { path: 'patients', loadComponent: () => import('./pages/patients/patients.component').then(m => m.PatientsComponent) },
      { path: 'orders', loadComponent: () => import('./pages/orders/orders.component').then(m => m.OrdersComponent) },
      { path: 'orders/:id', loadComponent: () => import('./pages/order-detail/order-detail.component').then(m => m.OrderDetailComponent) },
      { path: 'samples', loadComponent: () => import('./pages/samples/samples.component').then(m => m.SamplesComponent) },
      { path: 'tests', loadComponent: () => import('./pages/test-catalog/test-catalog.component').then(m => m.TestCatalogComponent) },
      { path: 'doctors', loadComponent: () => import('./pages/doctors/doctors.component').then(m => m.DoctorsComponent) },
      { path: 'analytics', loadComponent: () => import('./pages/analytics/analytics.component').then(m => m.AnalyticsComponent) },
      { path: 'notifications', loadComponent: () => import('./pages/notifications/notifications.component').then(m => m.NotificationsComponent) },
      { path: 'settings', loadComponent: () => import('./pages/admin-backup/admin-backup.component').then(m => m.AdminBackupComponent) },
      { path: 'settings/users', loadComponent: () => import('./pages/users/users.component').then(m => m.UsersComponent) },
      { path: 'settings/audit-log', loadComponent: () => import('./pages/audit-log/audit-log.component').then(m => m.AuditLogComponent) },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
