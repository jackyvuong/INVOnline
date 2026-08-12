import { formatNumber, STOCK_STATUS_LABELS } from '../constants';

export function truncateText(text: string, max = 36) {
  const s = String(text || '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

export function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

export function escapeCsvCell(v: unknown) {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsvRowNumber<T>(
  rows: T[],
  headers: string[],
  mapRow: (row: T, index: number) => unknown[]
) {
  const lines = [headers.map(escapeCsvCell).join(',')];
  rows.forEach((row, index) => {
    lines.push(mapRow(row, index).map(escapeCsvCell).join(','));
  });
  return lines.join('\r\n');
}

export function stockStatusLabel(status: string) {
  return STOCK_STATUS_LABELS[status] || status;
}

export { formatNumber };
