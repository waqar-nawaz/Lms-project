export function calculateAge(dob: string | Date | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

interface RefRange {
  gender: string;
  age_min: number | null;
  age_max: number | null;
  low: number | null;
  high: number | null;
  critical_low: number | null;
  critical_high: number | null;
}

export function pickReferenceRange(ranges: RefRange[], gender: string | null, age: number | null): RefRange | null {
  const candidates = ranges.filter((r) => {
    const genderOk = r.gender === 'any' || !gender || r.gender === gender;
    const ageOk =
      (r.age_min === null || age === null || age >= r.age_min) &&
      (r.age_max === null || age === null || age <= r.age_max);
    return genderOk && ageOk;
  });
  return candidates[0] || null;
}

export function flagForNumeric(numericValue: number, range: RefRange | null): string {
  if (!range) return 'pending';
  if (range.critical_low !== null && numericValue <= range.critical_low) return 'critical_low';
  if (range.critical_high !== null && numericValue >= range.critical_high) return 'critical_high';
  if (range.low !== null && numericValue < range.low) return 'low';
  if (range.high !== null && numericValue > range.high) return 'high';
  return 'normal';
}

export function isCriticalFlag(flag: string): boolean {
  return flag === 'critical_low' || flag === 'critical_high';
}
