import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { LabTest } from '../../core/models/models';
import { AuthService } from '../../core/services/auth.service';

interface ParamRange {
  gender: string;
  age_min: number | null;
  age_max: number | null;
  low: number | null;
  high: number | null;
  critical_low: number | null;
  critical_high: number | null;
}

interface ParamDraft {
  code: string;
  name: string;
  result_type: string;
  unit: string;
  decimal_places: number;
  required: boolean;
  reference_ranges: ParamRange[];
}

@Component({
  selector: 'app-test-catalog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './test-catalog.component.html',
  styleUrl: './test-catalog.component.scss',
})
export class TestCatalogComponent implements OnInit {
  tests: LabTest[] = [];
  departments: any[] = [];

  showForm = false;
  showNewDept = false;
  saving = false;
  error = '';
  submitted = false;

  newDeptName = '';
  newDeptCode = '';

  form = this.emptyForm();
  parameters: ParamDraft[] = [];

  constructor(private api: ApiService, public auth: AuthService) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.api.getTests().subscribe((rows) => (this.tests = rows));
    this.api.getDepartments().subscribe((rows) => (this.departments = rows));
  }

  emptyForm() {
    return {
      department_id: '',
      code: '',
      name: '',
      short_name: '',
      specimen_type: 'blood',
      method: '',
      tat_minutes: 60,
      price: 0,
    };
  }

  openForm() {
    this.form = this.emptyForm();
    this.parameters = [];
    this.error = '';
    this.submitted = false;
    this.showForm = true;
  }

  addParameter() {
    this.parameters.push({
      code: '',
      name: '',
      result_type: 'numeric',
      unit: '',
      decimal_places: 2,
      required: true,
      reference_ranges: [],
    });
  }

  removeParameter(i: number) {
    this.parameters.splice(i, 1);
  }

  addRange(p: ParamDraft) {
    p.reference_ranges.push({
      gender: 'any',
      age_min: null,
      age_max: null,
      low: null,
      high: null,
      critical_low: null,
      critical_high: null,
    });
  }

  removeRange(p: ParamDraft, i: number) {
    p.reference_ranges.splice(i, 1);
  }

  hasIncompleteParam(): boolean {
    return this.parameters.some((p) => !p.code || !p.name);
  }

  createDept() {
    if (!this.newDeptName || !this.newDeptCode) return;
    this.api.createDepartment({ name: this.newDeptName, code: this.newDeptCode }).subscribe({
      next: (dept) => {
        this.departments.push(dept);
        this.form.department_id = dept.id;
        this.showNewDept = false;
        this.newDeptName = '';
        this.newDeptCode = '';
      },
      error: (err) => (this.error = err.error?.error || 'Failed to create department'),
    });
  }

  submit() {
    this.submitted = true;
    if (!this.form.department_id || !this.form.code || !this.form.name || this.hasIncompleteParam()) {
      this.error = 'Please fill all required fields, including any parameter rows added.';
      return;
    }
    this.error = '';
    this.saving = true;
    this.api
      .createTest({
        ...this.form,
        parameters: this.parameters.map((p) => ({
          ...p,
          reference_ranges: p.result_type === 'numeric' ? p.reference_ranges : [],
        })),
      })
      .subscribe({
        next: () => {
          this.saving = false;
          this.showForm = false;
          this.load();
        },
        error: (err) => {
          this.saving = false;
          this.error = err.error?.error || 'Failed to create test';
        },
      });
  }
}
