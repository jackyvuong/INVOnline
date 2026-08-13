import { useEffect, useMemo, useState } from 'react';
import { api, downloadCsv } from '../api/client';
import { StatusBadge } from '../components/Badge';
import DataTable from '../components/DataTable';
import { Panel } from '../components/Panel';
import SelectAutocomplete from '../components/SelectAutocomplete';
import { useGlobalSearch } from '../context/SearchContext';
import { usePagedList } from '../hooks/usePagedList';
import { formatNumber, stockStatusLabel, todayDate, toCsvRowNumber } from '../utils/format';
import { notify } from '../utils/notification';

type Product = { id: number; code: string; name: string; brand: string; category: string; unit: string; stock: number; warningStock: number; status: string };

export default function StockPage() {
  const { search, setSearch } = useGlobalSearch();
  const [categories, setCategories] = useState<{ name: string }[]>([]);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const filters = useMemo(() => ({ category: filterCategory, status: filterStatus }), [filterCategory, filterStatus]);
  const list = usePagedList<Product>('/products', {
    defaultSort: { key: 'code', direction: 'asc' },
    search,
    filters,
  });

  useEffect(() => {
    api<{ name: string }[]>('/categories/options').then(setCategories);
  }, []);

  const exportCsv = async () => {
    const all = await list.fetchAll();
    if (all.length === 0) {
      notify.warning('Không có dữ liệu để xuất.');
      return;
    }
    const csv = toCsvRowNumber(
      all,
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
      <div className="toolbar">
        <div className="toolbar__grow">
          <input
            type="search"
            className="input"
            placeholder="Tìm mã, tên, hãng, công ty..."
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
        rowClassName={(row) => `row-status-${String(row.status).toLowerCase()}`}
        emptyTitle="Không có sản phẩm"
        emptyDesc="Thử đổi bộ lọc hoặc thêm sản phẩm mới."
        columns={[
          { key: 'code', label: 'Mã', sortable: true, render: (r) => <span className="mono">{String(r.code)}</span> },
          { key: 'name', label: 'Tên', sortable: true },
          { key: 'brand', label: 'Hãng', render: (r) => String(r.brand || '—') },
          { key: 'category', label: 'Công ty', sortable: true },
          { key: 'unit', label: 'Đơn vị' },
          { key: 'stock', label: 'Tồn', sortable: true, className: 'text-right', render: (r) => <strong>{formatNumber(Number(r.stock))}</strong> },
          { key: 'warningStock', label: 'Ngưỡng cảnh báo', className: 'text-right', render: (r) => formatNumber(Number(r.warningStock)) },
          { key: 'status', label: 'Trạng thái', sortable: true, render: (r) => <StatusBadge status={String(r.status)} /> },
        ]}
      />
    </Panel>
  );
}
