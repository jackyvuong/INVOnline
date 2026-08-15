import { useEffect, useMemo, useState } from 'react';
import { api, downloadCsv } from '../api/client';
import DataTable from '../components/DataTable';
import DateInput from '../components/DateInput';
import { Panel } from '../components/Panel';
import { useGlobalSearch } from '../context/SearchContext';
import { formatNumber, todayDate, toCsvRowNumber } from '../utils/format';
import { notify } from '../utils/notification';

type ReportRow = {
  code: string; name: string; brand: string;
  opening: number; inQty: number; outQty: number; adjustQty: number; closing: number;
};

type Summary = { opening: number; inQty: number; outQty: number; adjustQty: number; closing: number };

function firstDayOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export default function ReportPage() {
  const todayStr = todayDate();
  const { search, setSearch } = useGlobalSearch();
  const [from, setFrom] = useState(firstDayOfMonth);
  const [to, setTo] = useState(todayStr);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const summary = useMemo(() => rows.reduce<Summary>(
    (acc, row) => ({
      opening: acc.opening + Number(row.opening),
      inQty: acc.inQty + Number(row.inQty),
      outQty: acc.outQty + Number(row.outQty),
      adjustQty: acc.adjustQty + Number(row.adjustQty),
      closing: acc.closing + Number(row.closing),
    }),
    { opening: 0, inQty: 0, outQty: 0, adjustQty: 0, closing: 0 }
  ), [rows]);

  const run = async (showToast = false) => {
    setErrors({});
    if (!from) { setErrors({ fromDate: 'Từ ngày không được để trống.' }); return; }
    if (!to) { setErrors({ toDate: 'Đến ngày không được để trống.' }); return; }
    try {
      setRows(await api<ReportRow[]>(`/reports/stock-period?from=${from}&to=${to}`));
      if (showToast) notify.success('Đã cập nhật báo cáo.');
    } catch (e: unknown) {
      notify.error((e as { message?: string }).message || 'Không tạo được báo cáo.');
    }
  };

  useEffect(() => { run(); }, []);

  const exportCsv = () => {
    if (rows.length === 0) {
      notify.warning('Chưa có dữ liệu báo cáo để xuất.');
      return;
    }
    const csv = toCsvRowNumber(
      rows,
      ['Mã', 'Tên', 'Hãng', 'Đầu kỳ', 'Nhập', 'Xuất', 'Điều chỉnh', 'Cuối kỳ'],
      (row) => [row.code, row.name, row.brand || '', row.opening, row.inQty, row.outQty, row.adjustQty, row.closing]
    );
    downloadCsv(`bao-cao-ton-${from}_${to}.csv`, csv);
    notify.success('Đã xuất file CSV báo cáo.');
  };

  return (
    <Panel
      title="Báo cáo tồn theo khoảng thời gian"
      actions={
        <button type="button" className="btn btn--primary" onClick={exportCsv}>
          Export CSV
        </button>
      }
    >
      <div className="formula-box">
        <strong>Công thức:</strong> Cuối kỳ = Đầu kỳ + Nhập − Xuất + Điều chỉnh
      </div>

      <form
        className="report-filters"
        onSubmit={(e) => { e.preventDefault(); run(true); }}
      >
        <div className="field">
          <label htmlFor="report-from">Từ ngày</label>
          <DateInput id="report-from" title="Từ ngày" value={from} onChange={setFrom} />
          {errors.fromDate && <span className="field-error">{errors.fromDate}</span>}
        </div>
        <div className="field">
          <label htmlFor="report-to">Đến ngày</label>
          <DateInput id="report-to" title="Đến ngày" value={to} onChange={setTo} />
          {errors.toDate && <span className="field-error">{errors.toDate}</span>}
        </div>
        <div className="report-filters__action">
          <button type="submit" className="btn btn--primary">Xem báo cáo</button>
        </div>
      </form>

      <div className="toolbar">
        <div className="toolbar__grow">
          <input
            type="search"
            className="input"
            placeholder="Tìm mã, tên, hãng..."
            autoComplete="off"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {search && (
          <button type="button" className="btn btn--ghost" onClick={() => setSearch('')}>
            Xóa lọc
          </button>
        )}
      </div>

      <div className="summary-row" id="report-summary">
        <div className="summary-chip">Đầu kỳ: <strong>{formatNumber(summary.opening)}</strong></div>
        <div className="summary-chip summary-chip--success">Nhập: <strong>{formatNumber(summary.inQty)}</strong></div>
        <div className="summary-chip summary-chip--danger">Xuất: <strong>{formatNumber(summary.outQty)}</strong></div>
        <div className="summary-chip summary-chip--info">Điều chỉnh: <strong>{formatNumber(summary.adjustQty)}</strong></div>
        <div className="summary-chip">Cuối kỳ: <strong>{formatNumber(summary.closing)}</strong></div>
      </div>

      <DataTable
        rows={rows as unknown as Record<string, unknown>[]}
        searchKeys={['code', 'name', 'brand']}
        searchPlaceholder="Tìm mã, tên, hãng..."
        externalSearch={search}
        defaultSort={{ key: 'code', direction: 'asc' }}
        emptyTitle="Chưa có báo cáo"
        emptyDesc='Chọn khoảng thời gian rồi nhấn "Xem báo cáo".'
        columns={[
          { key: 'code', label: 'Mã', sortable: true, render: (r) => <span className="mono">{String(r.code)}</span> },
          { key: 'name', label: 'Tên', sortable: true },
          { key: 'brand', label: 'Hãng', render: (r) => String(r.brand || '—') },
          { key: 'opening', label: 'Đầu kỳ', className: 'text-center col-num', render: (r) => formatNumber(Number(r.opening)) },
          { key: 'inQty', label: 'Nhập', className: 'text-center col-num text-success', render: (r) => formatNumber(Number(r.inQty)) },
          { key: 'outQty', label: 'Xuất', className: 'text-center col-num text-danger', render: (r) => formatNumber(Number(r.outQty)) },
          { key: 'adjustQty', label: 'Điều chỉnh', className: 'text-center col-num', render: (r) => formatNumber(Number(r.adjustQty)) },
          { key: 'closing', label: 'Cuối kỳ', className: 'text-center col-num', render: (r) => <strong>{formatNumber(Number(r.closing))}</strong> },
        ]}
      />
    </Panel>
  );
}
