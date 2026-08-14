import { formatNumber, STOCK_STATUS_LABELS } from '../constants';

export function truncateText(text: string, max = 36) {
  const s = String(text || '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

export function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

export function parseDateTime(value: unknown): Date | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const s = String(value).trim();

  let m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** UI date: dd/mm/yyyy */
export function formatDate(value: unknown): string {
  const d = parseDateTime(value);
  if (!d) return '';
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** UI datetime: DD-MM-YYYY HH:mm */
export function formatDateTime(value: unknown): string {
  const d = parseDateTime(value);
  if (!d) return value == null || value === '' ? '' : String(value);
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Convert UI/legacy date to yyyy-MM-dd for API filters. */
export function toApiDate(value: string) {
  const d = parseDateTime(value);
  if (!d) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function nowDateTime() {
  return formatDateTime(new Date());
}

/** Convert UI/legacy datetime to ISO local so ASP.NET binds DateTimeOffset. */
export function toApiDateTime(value: string) {
  const d = parseDateTime(value);
  if (!d) return String(value || '').trim();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:00`;
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
