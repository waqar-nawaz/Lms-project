function datePart(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

function randomDigits(n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10);
  return s;
}

export function generateOrderNumber(): string {
  return `ORD-${datePart()}-${randomDigits(6)}`;
}

export function generateBarcode(): string {
  return `LAB-${datePart()}-${randomDigits(6)}`;
}

export function generateReportNumber(): string {
  return `RPT-${datePart()}-${randomDigits(6)}`;
}

export function generateInvoiceNumber(): string {
  return `INV-${datePart()}-${randomDigits(6)}`;
}
