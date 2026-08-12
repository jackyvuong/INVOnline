import { useEffect, useState } from 'react';
import { api, downloadCsv } from '../api/client';
import { useConfirm } from '../components/ConfirmProvider';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import { Panel } from '../components/Panel';
import { useGlobalSearch } from '../context/SearchContext';
import { formatNumber, todayDate, toCsvRowNumber } from '../utils/format';
import { notify } from '../utils/notification';

type Category = { id: number; code: string; name: string; description: string; productCount: number };

export default function CategoriesPage() {
  const { confirmDialog } = useConfirm();
  const { search } = useGlobalSearch();
  const [rows, setRows] = useState<Category[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState({ code: '', name: '', description: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const load = () => api<Category[]>('/categories').then(setRows);
  useEffect(() => { load(); }, []);

  const openModal = (category: Category | null) => {
    setEditing(category);
    setForm(category ? { code: category.code, name: category.name, description: category.description || '' } : { code: '', name: '', description: '' });
    setErrors({});
    setOpen(true);
  };

  const save = async () => {
    try {
      if (editing) await api(`/categories/${editing.id}`, { method: 'PUT', body: JSON.stringify(form) });
      else await api('/categories', { method: 'POST', body: JSON.stringify(form) });
      setOpen(false);
      load();
      notify.success(editing ? 'Đã cập nhật công ty.' : 'Đã thêm công ty.');
    } catch (e: unknown) {
      const err = e as { errors?: Record<string, string>; message?: string };
      setErrors(err.errors || { _: err.message || 'Lỗi' });
      if (err.message) notify.error(err.message);
    }
  };

  const remove = async (c: Category) => {
    if (c.productCount > 0) {
      notify.error(`Không thể xóa. Có ${c.productCount} sản phẩm đang thuộc công ty "${c.name}".`);
      return;
    }
    const ok = await confirmDialog({
      title: 'Xóa công ty',
      message: `Bạn có chắc muốn xóa công ty "${c.name}" (${c.code})?`,
      confirmText: 'Xóa',
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/categories/${c.id}`, { method: 'DELETE' });
      load();
      notify.success('Đã xóa công ty.');
    } catch (e: unknown) {
      notify.error((e as { message?: string }).message || 'Không xóa được công ty.');
    }
  };

  const exportCsv = () => {
    const filtered = rows.filter((r) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return [r.code, r.name, r.description].some((v) => String(v).toLowerCase().includes(q));
    });
    if (filtered.length === 0) {
      notify.warning('Không có dữ liệu để xuất.');
      return;
    }
    const csv = toCsvRowNumber(
      filtered,
      ['STT', 'Mã công ty', 'Tên công ty', 'Mô tả', 'Số SP'],
      (row, index) => [index + 1, row.code, row.name, row.description || '', row.productCount]
    );
    downloadCsv(`cong-ty-${todayDate()}.csv`, csv);
    notify.success(`Đã xuất ${formatNumber(filtered.length)} công ty ra CSV.`);
  };

  const filtered = rows.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [r.code, r.name, r.description].some((v) => String(v).toLowerCase().includes(q));
  });

  return (
    <>
      <Panel
        title="Công Ty"
        subtitle="Khai báo danh mục công ty để chọn khi thêm / sửa sản phẩm."
        actions={
          <button type="button" className="btn btn--primary" onClick={() => openModal(null)}>
            + Thêm công ty
          </button>
        }
      >
        <DataTable
          rows={filtered as unknown as Record<string, unknown>[]}
          showSearch={false}
          externalSearch={search}
          showStt
          defaultSort={{ key: 'code', direction: 'asc' }}
          emptyTitle="Chưa có công ty"
          emptyDesc='Nhấn "Thêm công ty" để khai báo danh mục.'
          toolbar={
            <button type="button" className="btn btn--ghost" onClick={exportCsv}>
              Export CSV
            </button>
          }
          columns={[
            { key: 'code', label: 'Mã', sortable: true, render: (r) => <span className="mono">{String(r.code)}</span> },
            { key: 'name', label: 'Tên', sortable: true, render: (r) => <div className="cell-primary">{String(r.name)}</div> },
            { key: 'description', label: 'Mô tả', render: (r) => String(r.description || '—') },
            {
              key: 'productCount',
              label: 'Số SP',
              sortable: true,
              className: 'text-right',
              render: (r) => <strong>{formatNumber(Number(r.productCount))}</strong>,
            },
          ]}
          actions={(row) => {
            const c = row as unknown as Category;
            return (
              <>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => openModal(c)}>Sửa</button>
                <button type="button" className="btn btn--danger-ghost btn--sm" onClick={() => remove(c)}>Xóa</button>
              </>
            );
          }}
        />
      </Panel>

      <Modal
        open={open}
        title={editing ? 'Sửa công ty' : 'Thêm công ty'}
        onClose={() => setOpen(false)}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)}>Hủy</button>
            <button type="button" className="btn btn--primary" onClick={save}>Lưu</button>
          </>
        }
      >
        {errors._ && <p className="field-error">{errors._}</p>}
        <div className="form-grid">
          <div className="field">
            <label>Mã *
              <input className="input" placeholder="CT01" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
              {errors.code && <span className="field-error">{errors.code}</span>}
            </label>
          </div>
          <div className="field">
            <label>Tên *
              <input className="input" placeholder="Công ty ABC" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              {errors.name && <span className="field-error">{errors.name}</span>}
            </label>
          </div>
          <div className="field full">
            <label>Mô tả
              <textarea className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <p className="field-hint">Đổi tên công ty sẽ tự cập nhật trên các sản phẩm đang dùng tên cũ.</p>
          </div>
        </div>
      </Modal>
    </>
  );
}
