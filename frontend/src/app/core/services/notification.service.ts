import { Injectable, signal } from '@angular/core';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  unreadCount = signal(0);

  constructor(private api: ApiService) {}

  refresh() {
    this.api.getUnreadNotificationCount().subscribe({
      next: (res) => this.unreadCount.set(res.count),
      error: () => {},
    });
  }

  startPolling() {
    this.refresh();
    setInterval(() => this.refresh(), 30000);
  }
}
