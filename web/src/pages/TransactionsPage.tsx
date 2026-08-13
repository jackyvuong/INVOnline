import { useEffect, useMemo, useState } from 'react';
import { api, nowDateTime } from '../api/client';
import { TypeBadge } from '../components/Badge';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import { Panel } from '../components/Panel';
import SelectAutocomplete from '../components/SelectAutocomplete';
import { useGlobalSearch } from '../context/SearchContext';
import { formatNumber } from '../constants';
import { usePagedList } from '../hooks/usePagedList';
import { notify } from '../utils/notification';

type Tx = Record<string, unknown>;
type Product = { id: number; code: string; name: string; stock: number; unit: string; category: string; brand: string };

function defaultForm() {
  return {
    date: nowDateTime(),
    type: 'IN',
    productId: 0,
    quantityStr: '1',
    note: '',
  };
}

export default function TransactionsPage() {
  const { search, setSearch } = useGlobalSearch();
  const [products, setProducts] = useState<Product[]>([]);
  const [open, setOpen] = useState(false);
  const [filters, setFilters] = useState({
    type: '',
    category: '',
    productId: '',
    dateFrom: '',
    dateTo: '',
  });
  const [form, setForm] = useState(defaultForm());
  const [errors, setErrors] = useState<Record<string, string>>({});

  const apiFilters = useMemo(() => ({
    type: filters.type,
    category: filters.category,
    productId: filters.productId || undefined,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  }), [filters]);

  const list = usePagedList<Tx>('/transactions', {
    defaultSort: { key: 'movementAt', direction: 'desc' },
    search,
    filters: apiFilters,
  });

  useEffect(() => {
    api<Product[]>('/products/options').then(setProducts);
  }, []);

  const categories = useMemo(
    () => [...new Set(products.map((p) => p.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi')),
    [products]
  );

  const selectedProduct = products.find((p) => p.id === form.productId);

  const quantityHint =
    form.type === 'ADJUST'
      ? 'Nhập số nguyên dương hoặc âm, ví dụ +5 hoặc -3.'
      : form.type === 'OUT'
        ? 'Số lượng xuất phải là số nguyên dương và không vượt quá tồn.'
        : 'Số lượng nhập phải là số nguyên dương.';

  const openCreate = () => {
    setForm(defaultForm());
    setErrors({});
    setOpen(true);
  };

  const save = async () => {
    const quantity = Number(form.quantityStr);
    const payload = { date: form.date, type: form.type, productId: form.productId, quantity, note: form.note };
    try {
      await api('/transactions', { method: 'POST', body: JSON.stringify(payload) });
      setOpen(false);
      list.reload();
      api<Product[]>('/products/options').then(setProducts);
      notify.success('Đã tạo giao dịch.');
    } catch (e: unknown) {
      const err = e as { errors?: Record<string, string>; message?: string };
      setErrors(err.errors || { _: err.message || 'Lỗi' });
      if (err.message) notify.error(err.message);
    }
  };

  const clearFilters = () => {
    setSearch('');
    setFilters({ type: '', category: '', productId: '', dateFrom: '', dateTo: '' });
  };

  return (
    <>
      <Panel
        title="Biến động tồn kho"
        subtitle="Mỗi thao tác tạo một Transaction. Không sửa / xóa giao dịch cũ."
        actions={
          <button type="button" className="btn btn--primary" onClick={openCreate}>
            + Tạo giao dịch
          </button>
        }
      >
        <div className="toolbar">
          <div className="toolbar__grow">
            <input
              type="search"
              className="input"
              placeholder="Tìm mã, tên, hãng, công ty, ghi chú..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <SelectAutocomplete
            value={filters.type}
            onChange={(v) => setFilters((f) => ({ ...f, type: v }))}
            placeholder="Tìm loại..."
            options={[
              { value: '', label: 'Tất cả loại' },
              { value: 'IN', label: 'Nhập kho' },
              { value: 'OUT', label: 'Xuất kho' },
              { value: 'ADJUST', label: 'Điều chỉnh' },
            ]}
          />
          <SelectAutocomplete
            value={filters.category}
            onChange={(v) => setFilters((f) => ({ ...f, category: v }))}
            placeholder="Tìm công ty..."
            options={[
              { value: '', label: 'Tất cả công ty' },
              ...categories.map((c) => ({ value: c, label: c })),
            ]}
          />
          <SelectAutocomplete
            className="autocomplete--wide"
            value={filters.productId}
            onChange={(v) => setFilters((f) => ({ ...f, productId: v }))}
            placeholder="Tìm sản phẩm..."
            options={[
              { value: '', label: 'Tất cả sản phẩm' },
              ...products.map((p) => ({
                value: String(p.id),
                label: `${p.code} — ${p.name} (Tồn: ${formatNumber(p.stock)})`,
              })),
            ]}
          />
          <input type="date" className="input" title="Từ ngày" style={{ width: 'auto' }} value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} />
          <input type="date" className="input" title="Đến ngày" style={{ width: 'auto' }} value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} />
          <button type="button" className="btn btn--ghost" onClick={clearFilters}>Xóa lọc</button>
        </div>

        <DataTable
          serverMode
          rows={list.items}
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
          emptyTitle="Chưa có giao dịch"
          emptyDesc='Nhấn "+ Tạo giao dịch" để bắt đầu.'
          columns={[
            { key: 'movementAt', label: 'Ngày', sortable: true, render: (r) => String(r.movementAt ?? '').slice(0, 16).replace('T', ' ') || '—' },
            { key: 'type', label: 'Loại', sortable: true, render: (r) => <TypeBadge type={String(r.type)} /> },
            { key: 'productCode', label: 'Mã sản phẩm', sortable: true, render: (r) => <span className="mono">{String(r.productCode || '—')}</span> },
            { key: 'productName', label: 'Tên', sortable: true, render: (r) => String(r.productName || '—') },
            { key: 'companyName', label: 'Công Ty', sortable: true, render: (r) => String(r.companyName || '—') },
            { key: 'productBrand', label: 'Hãng', sortable: true, render: (r) => String(r.productBrand || '—') },
            {
              key: 'quantity', label: 'Số lượng', sortable: true, className: 'text-right',
              render: (r) => <strong className={Number(r.quantity) < 0 ? 'text-danger' : ''}>{formatNumber(Number(r.quantity))}</strong>,
            },
            { key: 'note', label: 'Ghi chú', render: (r) => String(r.note || '—') },
          ]}
        />
      </Panel>

      <Modal open={open} title="Tạo giao dịch" onClose={() => setOpen(false)}
        footer={<><button type="button" className="btn btn--ghost" onClick={() => setOpen(false)}>Hủy</button><button type="button" className="btn btn--primary" onClick={save}>Lưu</button></>}>
        {errors._ && <p className="field-error">{errors._}</p>}
        <div className="form-grid">
          <div className="field">
            <label>Ngày *<input value={form.date} placeholder="YYYY-MM-DD HH:mm" onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
          </div>
          <div className="field">
            <label>Loại *
              <select className="select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="IN">IN — Nhập kho</option>
                <option value="OUT">OUT — Xuất kho</option>
                <option value="ADJUST">ADJUST — Điều chỉnh</option>
              </select>
            </label>
          </div>
          <div className="field full">
            <label>Sản phẩm *
              <SelectAutocomplete
                value={form.productId ? String(form.productId) : ''}
                onChange={(v) => setForm({ ...form, productId: Number(v) || 0 })}
                placeholder="Tìm / chọn sản phẩm..."
                options={[
                  { value: '', label: '-- Chọn sản phẩm --' },
                  ...products.map((p) => ({
                    value: String(p.id),
                    label: `${p.code} — ${p.name} (Tồn: ${formatNumber(p.stock)})`,
                  })),
                ]}
              />
            </label>
            {selectedProduct && <div className="stock-preview">Tồn hiện tại: {formatNumber(selectedProduct.stock)} {selectedProduct.unit}</div>}
            {errors.productId && <span className="field-error">{errors.productId}</span>}
          </div>
          <div className="field">
            <label>Số lượng *
              <input
                type="text"
                inputMode="numeric"
                value={form.quantityStr}
                placeholder={form.type === 'ADJUST' ? '+5 hoặc -3' : 'Ví dụ: 10'}
                onChange={(e) => setForm({ ...form, quantityStr: e.target.value })}
              />
            </label>
            <div className="field-hint">{quantityHint}</div>
            {errors.quantity && <span className="field-error">{errors.quantity}</span>}
          </div>
          <div className="field">
            <label>Ghi chú<input value={form.note} maxLength={250} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
          </div>
        </div>
      </Modal>
    </>
  );
}
