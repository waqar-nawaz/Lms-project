import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-admin-backup',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-backup.component.html',
  styleUrl: './admin-backup.component.scss',
})
export class AdminBackupComponent {
  downloading = false;
  restoring = false;
  message = '';
  error = '';

  selectedFile: File | null = null;
  confirmText = '';
  parsedBackup: any = null;
  parseError = '';

  constructor(private api: ApiService) {}

  downloadBackup() {
    this.downloading = true;
    this.message = '';
    this.error = '';
    this.api.downloadBackup().subscribe({
      next: (blob) => {
        this.downloading = false;
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `lms-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.message = 'Backup downloaded.';
      },
      error: (err) => {
        this.downloading = false;
        this.error = err.error?.error || 'Failed to generate backup.';
      },
    });
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    this.selectedFile = null;
    this.parsedBackup = null;
    this.parseError = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        if (!parsed.tables) throw new Error('This file does not look like a LabTrack backup.');
        this.parsedBackup = parsed;
        this.selectedFile = file;
      } catch (e: any) {
        this.parseError = e.message || 'Could not read this file.';
      }
    };
    reader.readAsText(file);
  }

  get tableSummary(): { table: string; count: number }[] {
    if (!this.parsedBackup) return [];
    return Object.entries(this.parsedBackup.tables).map(([table, rows]) => ({
      table,
      count: (rows as any[]).length,
    }));
  }

  restore() {
    if (!this.parsedBackup || this.confirmText !== 'RESTORE') return;
    this.restoring = true;
    this.message = '';
    this.error = '';
    this.api.restoreBackup(this.parsedBackup).subscribe({
      next: (res) => {
        this.restoring = false;
        this.message = `Restore complete. ${Object.values(res.tableCounts as Record<string, number>).reduce((a, b) => a + b, 0)} rows restored across ${Object.keys(res.tableCounts).length} tables.`;
        this.selectedFile = null;
        this.parsedBackup = null;
        this.confirmText = '';
      },
      error: (err) => {
        this.restoring = false;
        this.error = err.error?.error || 'Restore failed.';
      },
    });
  }

  cancelRestore() {
    this.selectedFile = null;
    this.parsedBackup = null;
    this.confirmText = '';
    this.parseError = '';
  }
}
