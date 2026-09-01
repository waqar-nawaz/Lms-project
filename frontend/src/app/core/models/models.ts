export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  branchId: string;
}

export interface Patient {
  id: string;
  mrn: string;
  first_name: string;
  middle_name?: string;
  last_name?: string;
  dob?: string;
  gender?: string;
  identity_number?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  blood_group?: string;
  notes?: string;
}

export interface Doctor {
  id: string;
  name: string;
  specialty?: string;
  phone?: string;
}

export interface TestParameter {
  id: string;
  code: string;
  name: string;
  result_type: string;
  unit?: string;
  decimal_places?: number;
  display_order?: number;
}

export interface LabTest {
  id: string;
  code: string;
  name: string;
  short_name?: string;
  specimen_type: string;
  price: number;
  department_name: string;
  parameters: TestParameter[];
}

export interface Order {
  id: string;
  order_number: string;
  patient_id: string;
  first_name?: string;
  last_name?: string;
  mrn?: string;
  doctor_name?: string;
  priority: string;
  status: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  due: number;
  created_at: string;
  items?: OrderItem[];
  specimens?: Specimen[];
}

export interface OrderItem {
  id: string;
  test_id: string;
  test_name: string;
  test_code: string;
  specimen_type: string;
  price: number;
  status: string;
}

export interface Specimen {
  id: string;
  order_id: string;
  specimen_type: string;
  barcode: string;
  status: string;
  collected_at?: string;
  received_at?: string;
  rejection_reason?: string;
}

export interface ResultRow {
  order_item_id: string;
  test_name: string;
  parameter_id: string;
  parameter_name: string;
  unit?: string;
  result_type: string;
  result_id?: string;
  value?: string;
  flag?: string;
  result_status?: string;
}

export interface Invoice {
  id: string;
  order_id: string;
  invoice_number: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  status: string;
  payments?: Payment[];
}

export interface Payment {
  id: string;
  amount: number;
  method: string;
  transaction_reference?: string;
  paid_at: string;
}
