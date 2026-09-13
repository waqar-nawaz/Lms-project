import { Component, HostListener, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationStart, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ThemeService } from '../../core/services/theme.service';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent implements OnInit {
  menuOpen = false;
  collapsed = signal(localStorage.getItem('lms_sidebar_collapsed') === 'true');
  isMobile = signal(typeof window !== 'undefined' && window.innerWidth <= 860);

  constructor(
    public auth: AuthService,
    public theme: ThemeService,
    public notif: NotificationService,
    private router: Router
  ) {
    this.router.events.subscribe((e) => {
      if (e instanceof NavigationStart) this.menuOpen = false;
    });
  }

  ngOnInit() {
    this.notif.startPolling();
  }

  @HostListener('window:resize')
  onResize() {
    this.isMobile.set(window.innerWidth <= 860);
  }

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
