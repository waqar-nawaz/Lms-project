import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-audit-log',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './audit-log.component.html',
  styleUrl: './audit-log.component.scss',
})
export class AuditLogComponent implements OnInit {
  logs: any[] = [];

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.api.getAuditLogs().subscribe((rows) => (this.logs = rows));
  }
}
