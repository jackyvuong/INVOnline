import { useEffect, useMemo, useState } from 'react';
import { api, downloadCsv } from '../api/client';
import { StatusBadge } from '../components/Badge';
import { useConfirm } from '../components/ConfirmProvider';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import NoteCell from '../components/NoteCell';
import { Panel } from '../components/Panel';
import SelectAutocomplete from '../components/SelectAutocomplete';
import { UNIT_SUGGESTIONS } from '../constants';
import { useGlobalSearch } from '../context/SearchContext';
import { usePagedList } from '../hooks/usePagedList';
import { formatNumber, stockStatusLabel, todayDate, toCsvRowNumber } from '../utils/format';
import { notify } from '../utils/notification';

type Product = {
  id: number; code: string; name: string; category: string; unit: string; brand: string;
  description: string; note: string; warningStock: number; stock: number; status: string;
};

export default function ProductsPage() {
  const { confirmDialog } = useConfirm();
  const { search, setSearch } = useGlobalSearch();
  const [categories, setCategories] = useState<{ name: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [form, setForm] = useState({ code: '', name: '', category: '', unit: '', brand: '', description: '', note: '', warningStock: 10 });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const filters = useMemo(() => ({ category: filterCategory, status: filterStatus }), [filterCategory, filterStatus]);
  const list = usePagedList<Product>('/products', {
    defaultSort: { key: 'code', direction: 'asc' },
    search,
    filters,
  });

  useEffect(() => {
    api<{ name: string }[]>('/categories/options').then(setCategories);
  }, []);

  const openModal = (product: Product | null) => {
    setEditing(product);
    setForm(product
      ? { code: product.code, name: product.name, category: product.category, unit: product.unit, brand: product.brand || '', description: product.description || '', note: product.note || '', warningStock: product.warningStock }
      : { code: '', name: '', category: '', unit: '', brand: '', description: '', note: '', warningStock: 10 });
    setErrors({});
    setOpen(true);
  };

  const save = async () => {
    const payload = { code: form.code, name: form.name, categoryName: form.category, unit: form.unit, brand: form.brand, description: form.description, note: form.note, warningStock: form.warningStock };
    try {
      if (editing) await api(`/products/${editing.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      else await api('/products', { method: 'POST', body: JSON.stringify(payload) });
      setOpen(false);
      list.reload();
      notify.success(editing ? 'Đã cập nhật sản phẩm.' : 'Đã thêm sản phẩm.');
    } catch (e: unknown) {
      const err = e as { errors?: Record<string, string>; message?: string };
      setErrors(err.errors || { _: err.message || 'Lỗi' });
      if (err.message) notify.error(err.message);
    }
  };

  const remove = async (p: Product) => {
    const ok = await confirmDialog({
      title: 'Xóa sản phẩm',
      message: `Bạn có chắc muốn xóa "${p.name}" (${p.code})?`,
      confirmText: 'Xóa',
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/products/${p.id}`, { method: 'DELETE' });
      list.reload();
      notify.success('Đã xóa sản phẩm.');
    } catch (e: unknown) {
      notify.error((e as { message?: string }).message || 'Không xóa được sản phẩm.');
    }
  };

  const exportCsv = async () => {
    const all = await list.fetchAll();
    if (all.length === 0) {
      notify.warning('Không có dữ liệu để xuất.');
      return;
    }
    const csv = toCsvRowNumber(
      all,
      ['STT', 'Mã', 'Tên', 'Công ty', 'Hãng', 'Đơn vị', 'Tồn hiện tại', 'Ngưỡng cảnh báo', 'Trạng thái', 'Mô tả', 'Ghi chú'],
      (row, index) => [
        index + 1, row.code, row.name, row.category, row.brand || '', row.unit,
        row.stock, row.warningStock, stockStatusLabel(row.status), row.description || '', row.note || '',
      ]
    );
    downloadCsv(`san-pham-${todayDate()}.csv`, csv);
    notify.success(`Đã xuất ${formatNumber(all.length)} sản phẩm ra CSV.`);
  };

  return (
    <>
      <Panel
        title="Quản lý sản phẩm"
        actions={
          <button type="button" className="btn btn--primary" onClick={() => openModal(null)}>
            + Thêm sản phẩm
          </button>
        }
      >
        <div className="toolbar">
          <div className="toolbar__grow">
            <input
              type="search"
              className="input"
              placeholder="Tìm mã, tên, công ty, hãng..."
              autoComplete="off"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <SelectAutocomplete
            value={filterCategory}
            onChange={setFilterCategory}
            placeholder="Tìm công ty..."
            options={[
              { value: '', label: 'Tất cả công ty' },
              ...categories.map((c) => ({ value: c.name, label: c.name })),
            ]}
          />
          <SelectAutocomplete
            value={filterStatus}
            onChange={setFilterStatus}
            placeholder="Tìm trạng thái..."
            options={[
              { value: '', label: 'Tất cả trạng thái' },
              { value: 'OK', label: 'Đủ hàng' },
              { value: 'LOW', label: 'Sắp hết' },
              { value: 'OUT', label: 'Hết hàng' },
            ]}
          />
          {(search || filterCategory || filterStatus) && (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setSearch('');
                setFilterCategory('');
                setFilterStatus('');
              }}
            >
              Xóa lọc
            </button>
          )}
          <button type="button" className="btn btn--ghost" onClick={exportCsv}>Export CSV</button>
        </div>

        <DataTable
          serverMode
          rows={list.items as unknown as Record<string, unknown>[]}
          total={list.total}
          page={list.page}
          pageSizeControlled={list.pageSize}
          onPageChange={list.setPage}
          onPageSizeChange={list.setPageSize}
          sortKey={list.sortKey}
          sortDir={list.sortDir}
          onSortChange={list.setSort}
          loading={list.loading}
          showSearch={false}
          externalSearch={search}
          showStt
          emptyTitle="Chưa có sản phẩm"
          emptyDesc='Nhấn "Thêm sản phẩm" để bắt đầu.'
          columns={[
            { key: 'code', label: 'Mã', sortable: true, render: (r) => <span className="mono">{String(r.code)}</span> },
            {
              key: 'name', label: 'Tên', sortable: true,
              render: (r) => (
                <>
                  <div className="cell-primary">{String(r.name)}</div>
                  {r.description ? <div className="cell-secondary">{String(r.description)}</div> : null}
                </>
              ),
            },
            { key: 'category', label: 'Công ty', sortable: true },
            { key: 'brand', label: 'Hãng', render: (r) => String(r.brand || '—') },
            { key: 'unit', label: 'Đơn vị' },
            { key: 'stock', label: 'Tồn', sortable: true, className: 'text-right', render: (r) => <strong>{formatNumber(Number(r.stock))}</strong> },
            { key: 'status', label: 'Trạng thái', sortable: true, render: (r) => <StatusBadge status={String(r.status)} /> },
            { key: 'note', label: 'Ghi chú', className: 'note-col', render: (r) => <NoteCell note={String(r.note || '')} /> },
          ]}
          actions={(row) => {
            const p = row as unknown as Product;
            return (
              <>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => openModal(p)}>Sửa</button>
                <button type="button" className="btn btn--danger-ghost btn--sm" onClick={() => remove(p)}>Xóa</button>
              </>
            );
          }}
        />
      </Panel>

      <Modal open={open} title={editing ? 'Sửa sản phẩm' : 'Thêm sản phẩm'} onClose={() => setOpen(false)} size="lg"
        footer={<><button type="button" className="btn btn--ghost" onClick={() => setOpen(false)}>Hủy</button><button type="button" className="btn btn--primary" onClick={save}>Lưu</button></>}>
        {errors._ && <p className="field-error">{errors._}</p>}
        <div className="form-grid">
          <div className="field">
            <label>Mã sản phẩm *
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
              {errors.code && <span className="field-error">{errors.code}</span>}
            </label>
          </div>
          <div className="field">
            <label>Tên sản phẩm *
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              {errors.name && <span className="field-error">{errors.name}</span>}
            </label>
          </div>
          <div className="field">
            <label>Công ty
              <SelectAutocomplete
                value={form.category}
                onChange={(v) => setForm({ ...form, category: v })}
                placeholder="Tìm / chọn công ty..."
                options={[
                  { value: '', label: '-- Chọn công ty --' },
                  ...categories.map((c) => ({ value: c.name, label: c.name })),
                ]}
              />
              {errors.categoryName && <span className="field-error">{errors.categoryName}</span>}
            </label>
            <p className="field-hint">Chọn từ danh mục Công Ty. Thêm mới tại menu Công Ty.</p>
          </div>
          <div className="field">
            <label>Đơn vị *
              <input list="unit-suggestions" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
              <datalist id="unit-suggestions">{UNIT_SUGGESTIONS.map((u) => <option key={u} value={u} />)}</datalist>
              {errors.unit && <span className="field-error">{errors.unit}</span>}
            </label>
          </div>
          <div className="field">
            <label>Hãng<input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></label>
          </div>
          <div className="field">
            <label>Ngưỡng cảnh báo tồn
              <input type="number" min={0} value={form.warningStock} onChange={(e) => setForm({ ...form, warningStock: Number(e.target.value) })} />
            </label>
            <p className="field-hint">Tồn kho ban đầu = 0. Muốn nhập tồn → tạo giao dịch IN.</p>
          </div>
          <div className="field full">
            <label>Mô tả<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          </div>
          <div className="field full">
            <label>Ghi chú<textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
          </div>
        </div>
      </Modal>
    </>
  );
}
