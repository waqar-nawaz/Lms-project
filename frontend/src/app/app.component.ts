import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { LoadingService } from './core/services/loading.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet],
  template: `
    <div class="global-loader" *ngIf="loading.isLoading()"></div>
    <router-outlet></router-outlet>
  `,
  styles: [`
    .global-loader {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: linear-gradient(90deg, #145374, #5fb4e5, #145374);
      background-size: 200% 100%;
      animation: loadingSlide 1s linear infinite;
      z-index: 9999;
    }
    @keyframes loadingSlide {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `],
})
export class AppComponent {
  constructor(public loading: LoadingService) {}
}
