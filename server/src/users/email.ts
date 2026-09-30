export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

// Deliberately loose: the operator types these into the CLI; this only
// catches typos like a missing @ or domain.
export function isValidEmail(normalized: string): boolean {
  return normalized.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}
