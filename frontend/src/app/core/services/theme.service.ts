import { Injectable, signal, effect } from '@angular/core';

export type Theme = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  theme = signal<Theme>((localStorage.getItem('lms_theme') as Theme) || 'light');

  constructor() {
    effect(() => {
      const t = this.theme();
      document.body.classList.toggle('dark-theme', t === 'dark');
      localStorage.setItem('lms_theme', t);
    });
  }

  toggle() {
    this.theme.set(this.theme() === 'light' ? 'dark' : 'light');
  }
}
