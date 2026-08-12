import { useRef } from 'react';
import { api, downloadJson } from '../api/client';
import { Panel } from '../components/Panel';

export default function SettingsPage() {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <Panel title="Export / Import dữ liệu">
        <p className="field-hint">Export/Import JSON giống legacy (Storage.exportAll / importAll).</p>
        <div className="toolbar toolbar--compact">
          <button type="button" className="btn btn--primary" onClick={async () => downloadJson(`qltk-export-${new Date().toISOString().slice(0, 10)}.json`, await api('/settings/export'))}>
            Export toàn bộ dữ liệu
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => fileRef.current?.click()}>Import JSON (ghi đè)</button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            if (!confirm('Import sẽ ghi đè toàn bộ dữ liệu. Tiếp tục?')) return;
            try {
              await api('/settings/import', { method: 'POST', body: await f.text() });
              alert('Import thành công');
              window.location.reload();
            } catch (err: unknown) {
              alert((err as { message?: string }).message || 'Import lỗi');
            }
            e.target.value = '';
          }} />
        </div>
      </Panel>

      <section className="panel danger-zone">
        <div className="panel__header"><h2 className="panel__title">Xóa toàn bộ dữ liệu</h2></div>
        <div className="panel__body">
          <p className="field-hint">Xóa hết categories, products, transactions, slips (giống Clear all legacy).</p>
          <button type="button" className="btn btn--danger" onClick={async () => {
            if (!confirm('Xóa toàn bộ dữ liệu?')) return;
            if (!confirm('Xác nhận lần 2?')) return;
            await api('/settings/clear', { method: 'POST' });
            alert('Đã xóa');
            window.location.reload();
          }}>Xóa toàn bộ dữ liệu</button>
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
