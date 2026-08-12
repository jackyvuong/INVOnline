import { useRef, useState } from 'react';
import { api, downloadJson } from '../api/client';
import { useConfirm } from '../components/ConfirmProvider';
import { Panel } from '../components/Panel';
import { notify } from '../utils/notification';

type LegacyPreview = {
  version?: string;
  exportedAt?: string;
  categories: number;
  products: number;
  transactions: number;
  exportSlips: number;
  importSlips: number;
};

function previewLegacyJson(text: string): LegacyPreview {
  const data = JSON.parse(text) as Record<string, unknown>;
  if (!Array.isArray(data.products)) throw new Error('File JSON thiếu mảng products.');
  if (!Array.isArray(data.transactions)) throw new Error('File JSON thiếu mảng transactions.');
  return {
    version: typeof data.version === 'string' ? data.version : undefined,
    exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : undefined,
    categories: Array.isArray(data.categories) ? data.categories.length : 0,
    products: data.products.length,
    transactions: data.transactions.length,
    exportSlips: Array.isArray(data.exportSlips) ? data.exportSlips.length : 0,
    importSlips: Array.isArray(data.importSlips) ? data.importSlips.length : 0,
  };
}

export default function SettingsPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const { confirmDialog } = useConfirm();
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<LegacyPreview | null>(null);

  const handleImport = async (file: File) => {
    let text: string;
    let parsed: LegacyPreview;
    try {
      text = await file.text();
      parsed = previewLegacyJson(text);
      setPreview(parsed);
    } catch (err: unknown) {
      notify.error((err as { message?: string }).message || 'File JSON không hợp lệ.');
      return;
    }

    const ok = await confirmDialog({
      title: 'Import từ legacy JSON',
      message:
        `File: ${file.name}\n` +
        `• ${parsed.products} sản phẩm\n` +
        `• ${parsed.transactions} giao dịch\n` +
        `• ${parsed.categories} nhóm / ${parsed.exportSlips} phiếu xuất / ${parsed.importSlips} phiếu nhập\n\n` +
        'Import sẽ GHI ĐÈ toàn bộ dữ liệu hiện tại trên hệ thống mới. Nên Export backup trước. Tiếp tục?',
      confirmText: 'Import',
      danger: true,
    });
    if (!ok) return;

    setImporting(true);
    try {
      const result = await api<{ ok: boolean; summary?: LegacyPreview & { skippedTransactions?: number } }>(
        '/settings/import',
        { method: 'POST', body: text },
      );
      const s = result.summary;
      notify.success(
        s
          ? `Import thành công: ${s.products} SP, ${s.transactions} GD, ${s.exportSlips} PX, ${s.importSlips} PN.`
          : 'Import thành công.',
      );
      window.location.reload();
    } catch (err: unknown) {
      notify.error((err as { message?: string }).message || 'Import thất bại.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <Panel title="Import dữ liệu từ hệ thống cũ (legacy)">
        <p className="field-hint">
          Chọn file JSON export từ app cũ (<code>inventory</code>): Cài đặt → Export toàn bộ dữ liệu,
          hoặc file backup <code>latest.json</code> / <code>qltk-backup-*.json</code>.
          Định dạng giống <code>Storage.exportAll()</code>.
        </p>
        <div className="toolbar toolbar--compact">
          <button
            type="button"
            className="btn btn--primary"
            disabled={importing}
            onClick={() => fileRef.current?.click()}
          >
            {importing ? 'Đang import...' : 'Chọn file JSON legacy'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) await handleImport(f);
            }}
          />
        </div>
        {preview && (
          <div className="settings-card" style={{ marginTop: '1rem' }}>
            <p className="field-hint">
              File gần nhất: v{preview.version || '?'} — {preview.exportedAt || '—'} ·{' '}
              {preview.categories} nhóm · {preview.products} SP · {preview.transactions} GD ·{' '}
              {preview.exportSlips} phiếu xuất · {preview.importSlips} phiếu nhập
            </p>
          </div>
        )}
      </Panel>

      <Panel title="Export / Import dữ liệu hiện tại">
        <p className="field-hint">Export/Import JSON giữa các bản sao của hệ thống online (cùng định dạng legacy).</p>
        <div className="toolbar toolbar--compact">
          <button
            type="button"
            className="btn btn--primary"
            onClick={async () =>
              downloadJson(`qltk-export-${new Date().toISOString().slice(0, 10)}.json`, await api('/settings/export'))
            }
          >
            Export toàn bộ dữ liệu
          </button>
          <button type="button" className="btn btn--ghost" disabled={importing} onClick={() => fileRef.current?.click()}>
            Import JSON (ghi đè)
          </button>
        </div>
      </Panel>

      <section className="panel danger-zone">
        <div className="panel__header"><h2 className="panel__title">Xóa toàn bộ dữ liệu</h2></div>
        <div className="panel__body">
          <p className="field-hint">Xóa hết categories, products, transactions, slips (giống Clear all legacy).</p>
          <button
            type="button"
            className="btn btn--danger"
            onClick={async () => {
              if (!(await confirmDialog({ title: 'Xóa dữ liệu', message: 'Xóa toàn bộ dữ liệu?', danger: true, confirmText: 'Xóa' }))) return;
              if (!(await confirmDialog({ title: 'Xác nhận lần 2', message: 'Thao tác không thể hoàn tác. Xác nhận?', danger: true, confirmText: 'Xóa hết' }))) return;
              await api('/settings/clear', { method: 'POST' });
              notify.success('Đã xóa toàn bộ dữ liệu.');
              window.location.reload();
            }}
          >
            Xóa toàn bộ dữ liệu
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panel__header"><h2 className="panel__title">Thông tin hệ thống</h2></div>
        <div className="panel__body">
          <p className="field-hint">Dữ liệu lưu trên PostgreSQL (Supabase). Mọi thao tác thêm/sửa/xóa ghi email người thực hiện.</p>
        </div>
      </section>
    </>
  );
}
