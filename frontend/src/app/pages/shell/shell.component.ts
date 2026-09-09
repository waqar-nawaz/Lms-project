import { Component, HostListener, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationStart, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ThemeService } from '../../core/services/theme.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent {
  menuOpen = false;
  collapsed = signal(localStorage.getItem('lms_sidebar_collapsed') === 'true');
  isMobile = signal(typeof window !== 'undefined' && window.innerWidth <= 860);

  constructor(public auth: AuthService, public theme: ThemeService, private router: Router) {
    this.router.events.subscribe((e) => {
      if (e instanceof NavigationStart) this.menuOpen = false;
    });
  }

  @HostListener('window:resize')
  onResize() {
    this.isMobile.set(window.innerWidth <= 860);
  }

  // The desktop icon-only collapse mode should never apply on mobile —
  // the mobile drawer always shows full labels regardless of the
  // desktop collapse preference saved in localStorage.
  isIconOnly(): boolean {
    return this.collapsed() && !this.isMobile();
  }

  toggleMenu() {
    this.menuOpen = !this.menuOpen;
  }

  toggleCollapse() {
    this.collapsed.update((v) => !v);
    localStorage.setItem('lms_sidebar_collapsed', String(this.collapsed()));
  }
}
