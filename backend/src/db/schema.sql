-- Laboratory Management System - Core Schema
-- Covers: org/branch/users/roles, patients, doctors, departments,
-- test catalog, orders, specimens, results, reports, billing, audit.
-- Extend with inventory/equipment/QC/notifications tables as those
-- modules are built (see spec doc sections 24-29).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  phone TEXT,
  email TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (organization_id, code)
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN (
    'super_admin','lab_manager','receptionist','phlebotomist',
    'lab_technician','pathologist','accountant','inventory_manager',
    'quality_officer','doctor','patient'
  )),
  active BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id),
  mrn TEXT NOT NULL,
  first_name TEXT NOT NULL,
  middle_name TEXT,
  last_name TEXT,
  dob DATE,
  gender TEXT CHECK (gender IN ('male','female','other')),
  identity_number TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  emergency_contact TEXT,
  blood_group TEXT,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (branch_id, mrn)
);
CREATE INDEX idx_patients_phone ON patients(phone);
CREATE INDEX idx_patients_identity ON patients(identity_number);
CREATE INDEX idx_patients_name ON patients(first_name, last_name);

CREATE TABLE doctors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id),
  name TEXT NOT NULL,
  specialty TEXT,
  license_number TEXT,
  phone TEXT,
  email TEXT,
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (branch_id, code)
);

CREATE TABLE tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES departments(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  short_name TEXT,
  specimen_type TEXT NOT NULL,
  method TEXT,
  tat_minutes INTEGER,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (department_id, code)
);

CREATE TABLE test_parameters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  result_type TEXT NOT NULL CHECK (result_type IN ('numeric','text','dropdown','positive_negative','calculated')),
  unit TEXT,
  decimal_places INTEGER DEFAULT 2,
  display_order INTEGER DEFAULT 0,
  required BOOLEAN NOT NULL DEFAULT true,
  formula TEXT,
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE reference_ranges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parameter_id UUID NOT NULL REFERENCES test_parameters(id) ON DELETE CASCADE,
  gender TEXT CHECK (gender IN ('male','female','any')) DEFAULT 'any',
  age_min NUMERIC,
  age_max NUMERIC,
  age_unit TEXT DEFAULT 'years',
  low NUMERIC,
  high NUMERIC,
  critical_low NUMERIC,
  critical_high NUMERIC,
  version INTEGER NOT NULL DEFAULT 1,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE
);

CREATE TABLE packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE package_tests (
  package_id UUID NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  test_id UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  PRIMARY KEY (package_id, test_id)
);

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id),
  patient_id UUID NOT NULL REFERENCES patients(id),
  doctor_id UUID REFERENCES doctors(id),
  order_number TEXT UNIQUE NOT NULL,
  priority TEXT NOT NULL DEFAULT 'routine' CHECK (priority IN ('routine','urgent','stat')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft','registered','paid','partially_paid','awaiting_sample',
    'sample_collected','in_processing','partially_completed',
    'awaiting_verification','completed','cancelled','rejected'
  )),
  source TEXT DEFAULT 'walk_in',
  notes TEXT,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  due NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  test_id UUID NOT NULL REFERENCES tests(id),
  price NUMERIC(12,2) NOT NULL,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending','sample_collected','in_processing','completed','verified','cancelled'
  ))
);

CREATE TABLE specimens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id),
  specimen_type TEXT NOT NULL,
  barcode TEXT UNIQUE NOT NULL,
  collected_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  collector_id UUID REFERENCES users(id),
  department_id UUID REFERENCES departments(id),
  status TEXT NOT NULL DEFAULT 'awaiting_collection' CHECK (status IN (
    'awaiting_collection','collected','received','accepted','rejected',
    'processing','completed','stored','disposed'
  )),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE specimen_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  specimen_id UUID NOT NULL REFERENCES specimens(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  status TEXT,
  performed_by UUID REFERENCES users(id),
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);

CREATE TABLE results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  parameter_id UUID NOT NULL REFERENCES test_parameters(id),
  specimen_id UUID REFERENCES specimens(id),
  value TEXT,
  numeric_value NUMERIC,
  unit TEXT,
  flag TEXT CHECK (flag IN (
    'normal','low','high','critical_low','critical_high',
    'positive','negative','abnormal','invalid','pending'
  )) DEFAULT 'pending',
  result_status TEXT NOT NULL DEFAULT 'entered' CHECK (result_status IN (
    'entered','reviewed','verified','amended'
  )),
  entered_by UUID REFERENCES users(id),
  entered_at TIMESTAMPTZ,
  verified_by UUID REFERENCES users(id),
  verified_at TIMESTAMPTZ,
  UNIQUE (order_item_id, parameter_id)
);

CREATE TABLE result_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id UUID NOT NULL REFERENCES results(id) ON DELETE CASCADE,
  old_value TEXT,
  new_value TEXT,
  reason TEXT,
  changed_by UUID REFERENCES users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  report_number TEXT UNIQUE NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','final','amended')),
  file_path TEXT,
  verification_token_hash TEXT,
  finalized_by UUID REFERENCES users(id),
  finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  invoice_number TEXT UNIQUE NOT NULL,
  subtotal NUMERIC(12,2) NOT NULL,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid','partially_paid','paid','void')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('cash','card','bank_transfer','mobile_wallet','cheque')),
  transaction_reference TEXT,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_by UUID REFERENCES users(id)
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  branch_id UUID REFERENCES branches(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  old_values JSONB,
  new_values JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
