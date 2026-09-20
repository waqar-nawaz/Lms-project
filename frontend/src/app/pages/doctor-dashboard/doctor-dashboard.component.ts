import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-doctor-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './doctor-dashboard.component.html',
  styleUrl: './doctor-dashboard.component.scss',
})
export class DoctorDashboardComponent implements OnInit {
  orders: any[] = [];
  selected: any = null;

  constructor(private api: ApiService, public auth: AuthService) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.api.getDoctorPortalOrders().subscribe((rows) => (this.orders = rows));
  }

  open(order: any) {
    this.api.getDoctorPortalOrder(order.id).subscribe((detail) => (this.selected = detail));
  }

  closeDetail() {
    this.selected = null;
  }

  download(reportId: string, reportNumber: string) {
    this.api.downloadDoctorPortalReport(reportId).subscribe((blob) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reportNumber}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    });
  }
}
