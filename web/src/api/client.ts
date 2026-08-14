const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

export function getToken(): string | null {
  return localStorage.getItem('qltk_token');
}

export function setToken(token: string) {
  localStorage.setItem('qltk_token', token);
}

export function clearToken() {
  localStorage.removeItem('qltk_token');
  localStorage.removeItem('qltk_user');
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401) {
    clearToken();
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText })) as {
      message?: string;
      title?: string;
      errors?: Record<string, string | string[]>;
    };
    if (!err.message && err.errors) {
      const first = Object.values(err.errors).flat()[0];
      err.message = String(first || err.title || res.statusText);
    }
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export type PagedResult<T> = { items: T[]; total: number; page: number; pageSize: number };

export type QueryParams = Record<string, string | number | undefined | null>;

export function buildQuery(params: QueryParams) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export async function apiPaged<T>(path: string, params: QueryParams = {}) {
  return api<PagedResult<T>>(`${path}${buildQuery(params)}`);
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function toCsv(rows: Record<string, unknown>[], columns: { key: string; label: string }[]) {
  const escape = (v: unknown) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.map((c) => escape(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => escape(r[c.key])).join(',')).join('\n');
  return `${header}\n${body}`;
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function stockStatusLabel(status: string) {
  if (status === 'OUT') return 'Hết hàng';
  if (status === 'LOW') return 'Sắp hết';
  return 'Đủ hàng';
}

export function txTypeLabel(type: string) {
  if (type === 'IN') return 'Nhập';
  if (type === 'OUT') return 'Xuất';
  if (type === 'ADJUST') return 'Điều chỉnh';
  return type;
}

export function slipStatusLabel(s: string) {
  if (s === 'PROCESSING') return 'Đang xử lý';
  if (s === 'COMPLETED') return 'Hoàn thành';
  if (s === 'RETURNED') return 'Hoàn trả';
  return s;
}

export { nowDateTime, toApiDateTime } from '../utils/format';
