import { useEffect, useMemo, useState } from 'react';
import { api, nowDateTime } from '../api/client';
import { TypeBadge } from '../components/Badge';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import { Panel } from '../components/Panel';
import { useGlobalSearch } from '../context/SearchContext';
import { formatNumber } from '../constants';
import { notify } from '../utils/notification';

type Tx = Record<string, unknown>;
type Product = { id: number; code: string; name: string; stock: number; unit: string; category: string; brand: string };

function toDateOnly(value: unknown) {
  return String(value ?? '').slice(0, 10);
}

function defaultForm(products: Product[]) {
  return {
    date: nowDateTime(),
    type: 'IN',
    productId: products[0]?.id || 0,
    quantityStr: '1',
    note: '',
  };
}

export default function TransactionsPage() {
  const { search, setSearch } = useGlobalSearch();
  const [rows, setRows] = useState<Tx[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [open, setOpen] = useState(false);
  const [filters, setFilters] = useState({
    type: '',
    category: '',
    productId: '',
    dateFrom: '',
    dateTo: '',
  });
  const [form, setForm] = useState(defaultForm([]));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const load = async () => {
    const [tx, p] = await Promise.all([api<Tx[]>('/transactions'), api<Product[]>('/products')]);
    setRows(tx);
    setProducts(p);
  };
  useEffect(() => { load(); }, []);

  const categories = useMemo(
    () => [...new Set(products.map((p) => p.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi')),
    [products]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((tx) => {
      if (filters.type && tx.type !== filters.type) return false;
      if (filters.category && tx.companyName !== filters.category) return false;
      if (filters.productId && String(tx.productId) !== filters.productId) return false;
      const day = toDateOnly(tx.movementAt);
      if (filters.dateFrom && day.localeCompare(filters.dateFrom) < 0) return false;
      if (filters.dateTo && day.localeCompare(filters.dateTo) > 0) return false;
      if (!q) return true;
      return [tx.productCode, tx.productName, tx.companyName, tx.productBrand, tx.note, tx.type]
        .map((x) => String(x ?? '').toLowerCase()).join(' ').includes(q);
    });
  }, [rows, filters, search]);

  const selectedProduct = products.find((p) => p.id === form.productId);

  const quantityHint =
    form.type === 'ADJUST'
      ? 'Nhập số nguyên dương hoặc âm, ví dụ +5 hoặc -3.'
      : form.type === 'OUT'
        ? 'Số lượng xuất phải là số nguyên dương và không vượt quá tồn.'
        : 'Số lượng nhập phải là số nguyên dương.';

  const openCreate = () => {
    setForm(defaultForm(products));
    setErrors({});
    setOpen(true);
  };

  const save = async () => {
    const quantity = Number(form.quantityStr);
    const payload = { date: form.date, type: form.type, productId: form.productId, quantity, note: form.note };
    try {
      await api('/transactions', { method: 'POST', body: JSON.stringify(payload) });
      setOpen(false);
      load();
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
          <select className="select" value={filters.type} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))} style={{ minWidth: 140 }}>
            <option value="">Tất cả loại</option>
            <option value="IN">Nhập kho</option>
            <option value="OUT">Xuất kho</option>
            <option value="ADJUST">Điều chỉnh</option>
          </select>
          <select className="select" value={filters.category} onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))} style={{ minWidth: 160 }}>
            <option value="">Tất cả công ty</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="select" value={filters.productId} onChange={(e) => setFilters((f) => ({ ...f, productId: e.target.value }))} style={{ minWidth: 220 }}>
            <option value="">Tất cả sản phẩm</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.code} — {p.name} (Tồn: {formatNumber(p.stock)})</option>
            ))}
          </select>
          <input type="date" className="input" title="Từ ngày" style={{ width: 'auto' }} value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} />
          <input type="date" className="input" title="Đến ngày" style={{ width: 'auto' }} value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} />
          <button type="button" className="btn btn--ghost" onClick={clearFilters}>Xóa lọc</button>
        </div>

        <DataTable
          showSearch={false}
          rows={filtered}
          defaultSort={{ key: 'movementAt', direction: 'desc' }}
          getSortValue={(row, key) => (key === 'movementAt' ? row.movementAt : row[key])}
          emptyTitle="Chưa có giao dịch"
          emptyDesc='Nhấn "+ Tạo giao dịch" để bắt đầu.'
          columns={[
            { key: 'movementAt', label: 'Ngày', sortable: true, render: (r) => String(r.movementAt).slice(0, 16).replace('T', ' ') },
            { key: 'type', label: 'Loại', sortable: true, render: (r) => <TypeBadge type={String(r.type)} /> },
            { key: 'productCode', label: 'Mã sản phẩm', sortable: true, render: (r) => <span className="mono">{String(r.productCode)}</span> },
            { key: 'productName', label: 'Tên', sortable: true },
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
              <select className="select" value={form.productId} onChange={(e) => setForm({ ...form, productId: Number(e.target.value) })}>
                <option value={0}>-- Chọn sản phẩm --</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.code} — {p.name} (Tồn: {formatNumber(p.stock)})</option>
                ))}
              </select>
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
