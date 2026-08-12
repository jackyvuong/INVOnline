import { useRef, useState } from 'react';
import { api } from '../api/client';
import { useConfirm } from '../components/ConfirmProvider';
import { Panel } from '../components/Panel';
import { notify } from '../utils/notification';

function previewLegacyJson(text: string) {
  const data = JSON.parse(text) as Record<string, unknown>;
  if (!Array.isArray(data.products)) throw new Error('File JSON thiếu mảng products.');
  if (!Array.isArray(data.transactions)) throw new Error('File JSON thiếu mảng transactions.');
  return {
    products: data.products.length,
    transactions: data.transactions.length,
  };
}

export default function SettingsPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const { confirmDialog } = useConfirm();
  const [importing, setImporting] = useState(false);

  const handleImport = async (file: File) => {
    let text: string;
    let parsed: { products: number; transactions: number };
    try {
      text = await file.text();
      parsed = previewLegacyJson(text);
    } catch (err: unknown) {
      notify.error((err as { message?: string }).message || 'File JSON không hợp lệ.');
      return;
    }

    const ok = await confirmDialog({
      title: 'Import dữ liệu',
      message: `File "${file.name}" — ${parsed.products} sản phẩm, ${parsed.transactions} giao dịch.\n\nGhi đè toàn bộ dữ liệu hiện tại. Tiếp tục?`,
      confirmText: 'Import',
      danger: true,
    });
    if (!ok) return;

    setImporting(true);
    try {
      await api('/settings/import', { method: 'POST', body: text });
      notify.success('Import thành công.');
      window.location.reload();
    } catch (err: unknown) {
      notify.error((err as { message?: string }).message || 'Import thất bại.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Panel title="Cài đặt">
      <p className="field-hint">Chọn file JSON export từ app cũ (Cài đặt → Export, hoặc file backup).</p>
      <div className="toolbar toolbar--compact">
        <button
          type="button"
          className="btn btn--primary"
          disabled={importing}
          onClick={() => fileRef.current?.click()}
        >
          {importing ? 'Đang import...' : 'Import JSON'}
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
    </Panel>
  );
}
