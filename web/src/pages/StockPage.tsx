import { useEffect, useMemo, useState } from 'react';
import { api, downloadCsv } from '../api/client';
import { StatusBadge } from '../components/Badge';
import DataTable from '../components/DataTable';
import { Panel } from '../components/Panel';
import { useGlobalSearch } from '../context/SearchContext';
import { formatNumber, stockStatusLabel, todayDate, toCsvRowNumber } from '../utils/format';
import { notify } from '../utils/notification';

type Product = { id: number; code: string; name: string; brand: string; category: string; unit: string; stock: number; warningStock: number; status: string };

export default function StockPage() {
  const { search } = useGlobalSearch();
  const [rows, setRows] = useState<Product[]>([]);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => { api<Product[]>('/products').then(setRows); }, []);

  const categories = useMemo(() => [...new Set(rows.map((r) => r.category))].sort(), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((p) => {
      if (filterCategory && p.category !== filterCategory) return false;
      if (filterStatus && p.status !== filterStatus) return false;
      if (!q) return true;
      return [p.code, p.name, p.brand, p.category].some((v) => String(v).toLowerCase().includes(q));
    });
  }, [rows, filterCategory, filterStatus, search]);

  const exportCsv = () => {
    if (filtered.length === 0) {
      notify.warning('Không có dữ liệu để xuất.');
      return;
    }
    const csv = toCsvRowNumber(
      filtered,
      ['STT', 'Mã', 'Tên', 'Hãng', 'Công ty', 'Đơn vị', 'Tồn hiện tại', 'Ngưỡng cảnh báo', 'Trạng thái'],
      (row, index) => [
        index + 1, row.code, row.name, row.brand || '', row.category, row.unit,
        row.stock, row.warningStock, stockStatusLabel(row.status),
      ]
    );
    downloadCsv(`ton-hien-tai-${todayDate()}.csv`, csv);
    notify.success('Đã xuất file CSV.');
  };

  return (
    <Panel
      title="Tồn hiện tại"
      actions={
        <button type="button" className="btn btn--primary" onClick={exportCsv}>
          Export CSV
        </button>
      }
    >
      <DataTable
        rows={filtered as unknown as Record<string, unknown>[]}
        showSearch={false}
        externalSearch={search}
        showStt
        defaultSort={{ key: 'code', direction: 'asc' }}
        getSortValue={(row, field) => (field === 'status' ? row.status : row[field])}
        rowClassName={(row) => `row-status-${String(row.status).toLowerCase()}`}
        emptyTitle="Không có sản phẩm"
        emptyDesc="Thử đổi bộ lọc hoặc thêm sản phẩm mới."
        toolbar={
          <>
            <select className="select" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} style={{ minWidth: 160 }}>
              <option value="">Tất cả công ty</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ minWidth: 150 }}>
              <option value="">Tất cả trạng thái</option>
              <option value="OK">Đủ hàng</option>
              <option value="LOW">Sắp hết</option>
              <option value="OUT">Hết hàng</option>
            </select>
          </>
        }
        columns={[
          { key: 'code', label: 'Mã', sortable: true, render: (r) => <span className="mono">{String(r.code)}</span> },
          { key: 'name', label: 'Tên', sortable: true },
          { key: 'brand', label: 'Hãng', render: (r) => String(r.brand || '—') },
          { key: 'category', label: 'Công ty' },
          { key: 'unit', label: 'Đơn vị' },
          { key: 'stock', label: 'Tồn', sortable: true, className: 'text-right', render: (r) => <strong>{formatNumber(Number(r.stock))}</strong> },
          { key: 'warningStock', label: 'Ngưỡng cảnh báo', className: 'text-right', render: (r) => formatNumber(Number(r.warningStock)) },
          { key: 'status', label: 'Trạng thái', render: (r) => <StatusBadge status={String(r.status)} /> },
        ]}
      />
    </Panel>
  );
}
