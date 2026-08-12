import { STOCK_STATUS_LABELS, TRANSACTION_TYPE_LABELS } from '../constants';

const statusTone: Record<string, string> = { OK: 'success', LOW: 'warning', OUT: 'danger' };
const typeTone: Record<string, string> = { IN: 'success', OUT: 'danger', ADJUST: 'info' };
const slipTone: Record<string, string> = { PROCESSING: 'info', COMPLETED: 'success', RETURNED: 'warning' };

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const text = label ?? STOCK_STATUS_LABELS[status] ?? status;
  return <span className={`badge badge--${statusTone[status] || 'info'}`}>{text}</span>;
}

export function TypeBadge({ type, label }: { type: string; label?: string }) {
  const text = label ?? TRANSACTION_TYPE_LABELS[type] ?? type;
  return <span className={`badge badge--${typeTone[type] || 'info'}`}>{text}</span>;
}

export function SlipStatusBadge({ status, label }: { status: string; label?: string }) {
  const text = label ?? status;
  return <span className={`badge badge--${slipTone[status] || 'info'}`}>{text}</span>;
}
