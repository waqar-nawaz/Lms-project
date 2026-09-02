import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Doctor, Invoice, LabTest, Order, Patient, ResultRow, Specimen } from '../models/models';

const base = environment.apiUrl;

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private http: HttpClient) {}

  // Dashboard
  getDashboardSummary(): Observable<any> {
    return this.http.get(`${base}/dashboard/summary`);
  }
  searchPatients(q: string): Observable<Patient[]> {
    return this.http.get<Patient[]>(`${base}/patients`, { params: q ? { q } : {} });
  }
  getPatient(id: string): Observable<Patient> {
    return this.http.get<Patient>(`${base}/patients/${id}`);
  }
  getPatientHistory(id: string): Observable<any> {
    return this.http.get(`${base}/patients/${id}/history`);
  }
  createPatient(payload: Partial<Patient>): Observable<{ patient: Patient; possible_duplicates: Patient[] }> {
    return this.http.post<{ patient: Patient; possible_duplicates: Patient[] }>(`${base}/patients`, payload);
  }
  updatePatient(id: string, payload: Partial<Patient>): Observable<Patient> {
    return this.http.put<Patient>(`${base}/patients/${id}`, payload);
  }

  // Doctors
  getDoctors(): Observable<Doctor[]> {
    return this.http.get<Doctor[]>(`${base}/doctors`);
  }
  createDoctor(payload: Partial<Doctor>): Observable<Doctor> {
    return this.http.post<Doctor>(`${base}/doctors`, payload);
  }

  // Catalog
  getTests(): Observable<LabTest[]> {
    return this.http.get<LabTest[]>(`${base}/catalog/tests`);
  }
  getDepartments(): Observable<any[]> {
    return this.http.get<any[]>(`${base}/catalog/departments`);
  }
  createDepartment(payload: { name: string; code: string }): Observable<any> {
    return this.http.post(`${base}/catalog/departments`, payload);
  }
  createTest(payload: any): Observable<any> {
    return this.http.post(`${base}/catalog/tests`, payload);
  }

  // Orders
  getOrders(status?: string): Observable<Order[]> {
    return this.http.get<Order[]>(`${base}/orders`, { params: status ? { status } : {} });
  }
  getOrder(id: string): Observable<Order> {
    return this.http.get<Order>(`${base}/orders/${id}`);
  }
  createOrder(payload: any): Observable<Order> {
    return this.http.post<Order>(`${base}/orders`, payload);
  }
  updateOrderStatus(id: string, status: string): Observable<Order> {
    return this.http.patch<Order>(`${base}/orders/${id}/status`, { status });
  }

  // Specimens
  generateSpecimens(orderId: string): Observable<Specimen[]> {
    return this.http.post<Specimen[]>(`${base}/specimens/orders/${orderId}/generate`, {});
  }
  getSpecimens(status?: string): Observable<Specimen[]> {
    return this.http.get<Specimen[]>(`${base}/specimens`, { params: status ? { status } : {} });
  }
  collectSpecimen(id: string): Observable<Specimen> {
    return this.http.patch<Specimen>(`${base}/specimens/${id}/collect`, {});
  }
  receiveSpecimen(id: string): Observable<Specimen> {
    return this.http.patch<Specimen>(`${base}/specimens/${id}/receive`, {});
  }
  rejectSpecimen(id: string, reason: string): Observable<Specimen> {
    return this.http.patch<Specimen>(`${base}/specimens/${id}/reject`, { reason });
  }

  // Results
  getResultsWorklist(orderId: string): Observable<ResultRow[]> {
    return this.http.get<ResultRow[]>(`${base}/results/orders/${orderId}`);
  }
  enterResult(payload: { order_item_id: string; parameter_id: string; value: string; amendment_reason?: string }): Observable<any> {
    return this.http.post(`${base}/results`, payload);
  }
  verifyResult(id: string): Observable<any> {
    return this.http.patch(`${base}/results/${id}/verify`, {});
  }

  // Reports
  getReports(orderId: string): Observable<any[]> {
    return this.http.get<any[]>(`${base}/reports/orders/${orderId}`);
  }
  generateReport(orderId: string): Observable<any> {
    return this.http.post(`${base}/reports/orders/${orderId}/generate`, {});
  }
  downloadReport(id: string): Observable<Blob> {
    return this.http.get(`${base}/reports/${id}/download`, { responseType: 'blob' });
  }
  verifyReport(token: string): Observable<any> {
    return this.http.get(`${base}/reports/verify/${token}`);
  }

  // Billing
  createInvoice(orderId: string): Observable<Invoice> {
    return this.http.post<Invoice>(`${base}/billing/orders/${orderId}/invoice`, {});
  }
  getInvoice(id: string): Observable<Invoice> {
    return this.http.get<Invoice>(`${base}/billing/invoices/${id}`);
  }
  recordPayment(invoiceId: string, payload: { amount: number; method: string; transaction_reference?: string }): Observable<any> {
    return this.http.post(`${base}/billing/invoices/${invoiceId}/payments`, payload);
  }
}
