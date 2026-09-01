import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-report-verify',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './report-verify.component.html',
  styleUrl: './report-verify.component.scss',
})
export class ReportVerifyComponent implements OnInit {
  loading = true;
  result: any = null;

  constructor(private api: ApiService, private route: ActivatedRoute) {}

  ngOnInit() {
    const token = this.route.snapshot.params['token'];
    this.api.verifyReport(token).subscribe({
      next: (res) => { this.result = res; this.loading = false; },
      error: () => { this.result = { verified: false }; this.loading = false; },
    });
  }
}
