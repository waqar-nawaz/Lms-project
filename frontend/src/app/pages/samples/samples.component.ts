import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { Specimen } from '../../core/models/models';

@Component({
  selector: 'app-samples',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './samples.component.html',
  styleUrl: './samples.component.scss',
})
export class SamplesComponent implements OnInit {
  specimens: (Specimen & { order_number?: string; first_name?: string; last_name?: string; mrn?: string })[] = [];
  statusFilter = '';
  message = '';

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.api.getSpecimens(this.statusFilter || undefined).subscribe((rows) => (this.specimens = rows as any));
  }

  flash(msg: string) {
    this.message = msg;
    setTimeout(() => (this.message = ''), 3000);
  }

  collect(id: string) {
    this.api.collectSpecimen(id).subscribe(() => { this.flash('Collected'); this.load(); });
  }

  receive(id: string) {
    this.api.receiveSpecimen(id).subscribe(() => { this.flash('Accessioned'); this.load(); });
  }
}
