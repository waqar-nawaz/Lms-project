import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-message-log',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './message-log.component.html',
  styleUrl: './message-log.component.scss',
})
export class MessageLogComponent implements OnInit {
  logs: any[] = [];

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.api.getMessageLog().subscribe((rows) => (this.logs = rows));
  }
}
