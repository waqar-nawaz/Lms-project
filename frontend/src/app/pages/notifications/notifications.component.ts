import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notifications.component.html',
  styleUrl: './notifications.component.scss',
})
export class NotificationsComponent implements OnInit {
  notifications: any[] = [];

  constructor(private api: ApiService, private router: Router, public notif: NotificationService) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.api.getNotifications().subscribe((rows) => (this.notifications = rows));
  }

  open(n: any) {
    if (!n.is_read) {
      this.api.markNotificationRead(n.id).subscribe(() => this.notif.refresh());
      n.is_read = true;
    }
    if (n.entity_type === 'result' || n.entity_type === 'specimen') {
      // Both link back to an order; we don't have the order id directly on the
      // notification, so just send them to Orders — good enough for now.
      this.router.navigate(['/orders']);
    }
  }

  markAllRead() {
    this.api.markAllNotificationsRead().subscribe(() => {
      this.notifications.forEach((n) => (n.is_read = true));
      this.notif.refresh();
    });
  }
}
