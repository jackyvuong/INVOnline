import { useEffect, useMemo, useState } from 'react';
import { api, apiPaged, downloadCsv, nowDateTime, toApiDateTime } from '../api/client';
import { SlipStatusBadge } from '../components/Badge';
import { useConfirm } from '../components/ConfirmProvider';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import NoteCell from '../components/NoteCell';
import { Panel } from '../components/Panel';
import SelectAutocomplete from '../components/SelectAutocomplete';
import { SLIP_STATUS_LABELS } from '../constants';
import { useGlobalSearch } from '../context/SearchContext';
import { usePagedList } from '../hooks/usePagedList';
import { formatNumber, toCsvRowNumber } from '../utils/format';
import { notify } from '../utils/notification';

type SlipItem = { productId: number; quantity: number; note: string };
type Slip = {
  id: number; code: string; slipDate: string;
  recipient?: string; supplier?: string;
  note: string; status: string; items: SlipItem[];
};
type Product = { id: number; legacyId?: number; code: string; name: string; brand: string; unit: string; stock: number };

type SlipConfig = {
  type: 'export' | 'import';
  base: string;
  title: string;
  subtitle: string;
  createLabel: string;
  partyLabel: string;
  partyField: 'recipient' | 'supplier';
  partyTableLabel: string;
  csvPrefix: string;
  completeTitle: string;
  completeMessage: string;
  returnTitle: string;
  returnMessage: (code: string) => string;
  emptyTitle: string;
  emptyDesc: string;
};

const EXPORT_CONFIG: SlipConfig = {
  type: 'export',
  base: '/export-slips',
  title: 'Phiếu xuất kho',
  subtitle: 'Mỗi phiếu có mã riêng. Trừ tồn khi Hoàn thành; hoàn trả để cộng lại tồn.',
  createLabel: '+ Tạo phiếu xuất',
  partyLabel: 'Người nhận',
  partyField: 'recipient',
  partyTableLabel: 'Người nhận',
  csvPrefix: 'phieu-xuat',
  completeTitle: 'Hoàn thành phiếu xuất',
  completeMessage: 'Hoàn thành sẽ trừ tồn kho theo các dòng sản phẩm. Bạn có chắc?',
  returnTitle: 'Hoàn trả phiếu xuất',
  returnMessage: (code) => `Hoàn trả phiếu "${code}" sẽ cộng lại tồn kho cho các sản phẩm trên phiếu. Tiếp tục?`,
  emptyTitle: 'Chưa có phiếu xuất',
  emptyDesc: 'Nhấn "Tạo phiếu xuất" để bắt đầu.',
};

const IMPORT_CONFIG: SlipConfig = {
  type: 'import',
  base: '/import-slips',
  title: 'Phiếu nhập kho',
  subtitle: 'Cộng tồn khi Hoàn thành; hoàn trả để trừ lại tồn.',
  createLabel: '+ Tạo phiếu nhập',
  partyLabel: 'Người giao / nguồn nhập',
  partyField: 'supplier',
  partyTableLabel: 'Người giao / nguồn',
  csvPrefix: 'phieu-nhap',
  completeTitle: 'Hoàn thành phiếu nhập',
  completeMessage: 'Hoàn thành sẽ cộng tồn kho theo các dòng sản phẩm. Bạn có chắc?',
  returnTitle: 'Hoàn trả phiếu nhập',
  returnMessage: (code) => `Hoàn trả phiếu "${code}" sẽ trừ lại tồn kho cho các sản phẩm trên phiếu. Tiếp tục?`,
  emptyTitle: 'Chưa có phiếu nhập',
  emptyDesc: 'Nhấn "Tạo phiếu nhập" để bắt đầu.',
};


function defaultForm() {
  return {
    slipDate: nowDateTime(),
    recipient: '',
    supplier: '',
    note: '',
    items: [] as SlipItem[],
  };
}

function SlipFormPage({ config }: { config: SlipConfig }) {
  const { confirmDialog } = useConfirm();
  const { search, setSearch } = useGlobalSearch();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<{ name: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [viewOnly, setViewOnly] = useState(false);
  const [editing, setEditing] = useState<Slip | null>(null);
  const [form, setForm] = useState(defaultForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [filters, setFilters] = useState({ status: '', dateFrom: '', dateTo: '' });

  const apiFilters = useMemo(() => ({
    status: filters.status,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  }), [filters]);

  const list = usePagedList<Slip & { party?: string; itemCount?: number; totalQty?: number }>(config.base, {
    defaultSort: { key: 'slipDate', direction: 'desc' },
    search,
    filters: apiFilters,
  });

  const loadProducts = () =>
    apiPaged<Product>('/products', { page: 1, pageSize: 50000 }).then((r) => setProducts(r.items));

  useEffect(() => {
    loadProducts();
    if (config.partyField === 'supplier') {
      api<{ name: string }[]>('/categories/options').then(setCategories);
    }
  }, [config.partyField]);

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const resolveProductId = (rawId: number) => {
    if (!rawId) return 0;
    if (productMap.has(rawId)) return rawId;
    const byLegacy = products.find((p) => p.legacyId === rawId);
    return byLegacy?.id || 0;
  };

  const parseItems = (items: unknown): SlipItem[] => {
    let raw: unknown[] = [];
    if (Array.isArray(items)) raw = items;
    else if (typeof items === 'string') {
      try { raw = JSON.parse(items) as unknown[]; } catch { return []; }
    }
    return raw.map((row) => {
      const r = (row || {}) as Record<string, unknown>;
      return {
        productId: Number(r.productId ?? r.ProductId ?? 0),
        quantity: Number(r.quantity ?? r.Quantity ?? 0),
        note: String(r.note ?? r.Note ?? ''),
      };
    }).filter((i) => i.quantity > 0);
  };

  const reloadAll = () => {
    list.reload();
    loadProducts();
  };

  const canEdit = !viewOnly && (!editing || editing.status === 'PROCESSING');

  const openCreate = () => {
    setEditing(null);
    setViewOnly(false);
    setForm(defaultForm());
    setErrors({});
    setOpen(true);
  };

  const openSlip = (s: Slip & { party?: string }, readonly: boolean) => {
    setEditing(s);
    setViewOnly(readonly);
    const items = parseItems(s.items).map((i) => ({
      ...i,
      productId: resolveProductId(i.productId) || i.productId,
    }));
    setForm({
      slipDate: String(s.slipDate).slice(0, 16).replace('T', ' '),
      recipient: s.recipient || '',
      supplier: s.supplier || '',
      note: s.note || '',
      items: items.length ? items.map((i) => ({ ...i })) : [],
    });
    setErrors({});
    setOpen(true);
  };

  const buildPayload = () => ({
    slipDate: toApiDateTime(form.slipDate),
    recipient: form.recipient,
    supplier: form.supplier,
    note: form.note,
    items: form.items
      .map((i) => ({ ...i, productId: resolveProductId(i.productId) || i.productId }))
      .filter((i) => i.productId && i.quantity > 0),
  });

  const save = async () => {
    const payload = buildPayload();
    if (payload.items.length === 0) {
      notify.error('Phiếu phải có ít nhất một sản phẩm. Bấm "+ Thêm dòng" rồi chọn sản phẩm.');
      return;
    }
    try {
      if (editing && !viewOnly) await api(`${config.base}/${editing.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      else if (!editing) await api(config.base, { method: 'POST', body: JSON.stringify(payload) });
      setOpen(false);
      reloadAll();
      notify.success(editing ? `Đã cập nhật phiếu ${config.type === 'export' ? 'xuất' : 'nhập'}.` : 'Đã tạo phiếu.');
    } catch (e: unknown) {
      const err = e as { errors?: Record<string, string>; message?: string };
      setErrors(err.errors || { _: err.message || 'Lỗi' });
      if (err.message) notify.error(err.message);
    }
  };

  const complete = async () => {
    const ok = await confirmDialog({ title: config.completeTitle, message: config.completeMessage, confirmText: 'Hoàn thành' });
    if (!ok) return;
    const payload = buildPayload();
    try {
      let slipId = editing?.id;
      if (editing) await api(`${config.base}/${editing.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      else {
        const created = await api<Slip>(config.base, { method: 'POST', body: JSON.stringify(payload) });
        slipId = created.id;
      }
      const result = await api<Slip>(`${config.base}/${slipId}/complete`, { method: 'POST' });
      setOpen(false);
      reloadAll();
      notify.success(`Đã hoàn thành phiếu ${result.code}. Tồn kho đã được cập nhật.`);
    } catch (e: unknown) {
      const err = e as { errors?: Record<string, string>; message?: string };
      setErrors(err.errors || { _: err.message || 'Lỗi' });
      notify.error(err.message || 'Không hoàn thành được phiếu.');
      reloadAll();
    }
  };

  const action = async (id: number, act: 'return' | 'copy' | 'delete', code?: string) => {
    try {
      if (act === 'delete') {
        const ok = await confirmDialog({
          title: `Xóa phiếu ${config.type === 'export' ? 'xuất' : 'nhập'}`,
          message: `Xóa phiếu "${code}"? Chỉ xóa được phiếu đang xử lý.`,
          confirmText: 'Xóa',
          danger: true,
        });
        if (!ok) return;
        await api(`${config.base}/${id}`, { method: 'DELETE' });
        reloadAll();
        notify.success(`Đã xóa phiếu ${config.type === 'export' ? 'xuất' : 'nhập'}.`);
        return;
      }
      if (act === 'return') {
        const ok = await confirmDialog({
          title: config.returnTitle,
          message: config.returnMessage(code || ''),
          confirmText: 'Hoàn trả',
          danger: true,
        });
        if (!ok) return;
        await api(`${config.base}/${id}/return`, { method: 'POST' });
        reloadAll();
        notify.success(`Đã hoàn trả phiếu ${code}. Tồn kho đã được cập nhật.`);
        return;
      }
      const copied = await api<Slip>(`${config.base}/${id}/copy`, { method: 'POST' });
      reloadAll();
      notify.success(`Đã sao chép thành phiếu ${copied.code}.`);
      openSlip(copied, false);
    } catch (e: unknown) {
      notify.error((e as { message?: string }).message || 'Lỗi');
    }
  };

  const exportSlipCsv = (s: Slip) => {
    const items = parseItems(s.items);
    if (items.length === 0) {
      notify.error('Phiếu không có sản phẩm để xuất.');
      return;
    }
    const csvRows = items.map((item) => {
      const p = productMap.get(resolveProductId(item.productId) || item.productId);
      return {
        name: p?.name || '(Đã xóa)',
        code: p?.code || '',
        brand: p?.brand || '',
        unit: p?.unit || '',
        quantity: item.quantity,
        note: item.note || '',
      };
    });
    const csv = toCsvRowNumber(
      csvRows,
      ['Stt\nItem', 'Mô tả\nDescription', 'Mã số\nCode', 'Nhãn hiệu\nBrand', 'Đvt\nUnit', 'S.Lượng\nQty', 'Đơn giá\nU.Price', 'Thành tiền\nTotal Amount', 'Ghi chú\nRemark'],
      (row, index) => [index + 1, row.name, row.code, row.brand, row.unit, row.quantity, '', '', row.note]
    );
    const safeCode = String(s.code || 'phieu').replace(/[\\/:*?"<>|]/g, '-');
    downloadCsv(`${config.csvPrefix}-${safeCode}.csv`, csv);
    notify.success(`Đã xuất CSV phiếu ${s.code}.`);
  };

  const updateItem = (idx: number, patch: Partial<SlipItem>) => {
    setForm((f) => ({ ...f, items: f.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }));
  };

  const removeLine = (idx: number) => {
    setForm((f) => {
      const items = f.items.filter((_, i) => i !== idx);
      return { ...f, items };
    });
  };

  const modalTitle = !editing
    ? (config.type === 'export' ? 'Tạo phiếu xuất' : 'Tạo phiếu nhập')
    : canEdit
      ? `Sửa phiếu ${editing.code}`
      : `Chi tiết phiếu ${editing.code}`;

  const statusDisplay = editing ? SLIP_STATUS_LABELS[editing.status] || editing.status : SLIP_STATUS_LABELS.PROCESSING;

  return (
    <>
      <Panel title={config.title} subtitle={config.subtitle} actions={
        <button type="button" className="btn btn--primary" onClick={openCreate}>{config.createLabel}</button>
      }>
        <div className="toolbar">
          <div className="toolbar__grow">
            <input type="search" className="input" placeholder="Tìm mã phiếu, người nhận, ghi chú..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <SelectAutocomplete
            value={filters.status}
            onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
            placeholder="Tìm trạng thái..."
            options={[
              { value: '', label: 'Tất cả trạng thái' },
              { value: 'PROCESSING', label: 'Đang xử lý' },
              { value: 'COMPLETED', label: 'Hoàn thành' },
              { value: 'RETURNED', label: 'Hoàn trả' },
            ]}
          />
          <input type="date" className="input" title="Từ ngày" style={{ width: 'auto' }} value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} />
          <input type="date" className="input" title="Đến ngày" style={{ width: 'auto' }} value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} />
          <button type="button" className="btn btn--ghost" onClick={() => { setSearch(''); setFilters({ status: '', dateFrom: '', dateTo: '' }); }}>Xóa lọc</button>
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
          emptyTitle={config.emptyTitle}
          emptyDesc={config.emptyDesc}
          columns={[
            { key: 'code', label: 'Mã', sortable: true, render: (r) => <span className="mono">{String(r.code)}</span> },
            { key: 'slipDate', label: 'Ngày', sortable: true, render: (r) => String(r.slipDate).slice(0, 16).replace('T', ' ') },
            { key: 'party', label: config.partyTableLabel, render: (r) => String(r.party || '—') },
            { key: 'itemCount', label: 'Số SP', sortable: true, className: 'text-right', render: (r) => formatNumber(Number(r.itemCount)) },
            { key: 'totalQty', label: 'Tổng SL', sortable: true, className: 'text-right', render: (r) => <strong>{formatNumber(Number(r.totalQty))}</strong> },
            { key: 'status', label: 'Trạng thái', render: (r) => <SlipStatusBadge status={String(r.status)} label={SLIP_STATUS_LABELS[String(r.status)]} /> },
            { key: 'note', label: 'Ghi chú', className: 'note-col', render: (r) => <NoteCell note={String(r.note || '')} max={32} /> },
          ]}
          actions={(row) => {
            const s = row as unknown as Slip & { party?: string };
            return (
              <>
                {s.status === 'PROCESSING' ? (
                  <>
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => openSlip(s, false)}>Sửa</button>
                    <button type="button" className="btn btn--danger-ghost btn--sm" onClick={() => action(s.id, 'delete', s.code)}>Xóa</button>
                  </>
                ) : (
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => openSlip(s, true)}>Xem</button>
                )}
                {s.status === 'COMPLETED' && (
                  <button type="button" className="btn btn--warning btn--sm" onClick={() => action(s.id, 'return', s.code)}>Hoàn trả</button>
                )}
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => action(s.id, 'copy', s.code)}>Copy</button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => exportSlipCsv(s)}>CSV</button>
              </>
            );
          }}
        />
      </Panel>

      <Modal
        open={open}
        title={modalTitle}
        onClose={() => setOpen(false)}
        size="lg"
        footer={
          canEdit ? (
            <>
              <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)}>Hủy</button>
              <button type="button" className="btn btn--ghost" onClick={save}>Lưu phiếu</button>
              <button type="button" className="btn btn--primary" onClick={complete}>Hoàn thành</button>
            </>
          ) : undefined
        }
      >
        {errors._ && <p className="field-error">{errors._}</p>}
        <div className="form-grid">
          <div className="field">
            <label>Mã phiếu<input readOnly value={editing?.code || ''} placeholder="Tự sinh khi lưu" /></label>
          </div>
          <div className="field">
            <label>Trạng thái<input readOnly value={statusDisplay} /></label>
          </div>
          <div className="field">
            <label>Ngày *<input readOnly={!canEdit} value={form.slipDate} onChange={(e) => setForm({ ...form, slipDate: e.target.value })} /></label>
          </div>
          <div className="field">
            <label>{config.partyLabel}
              {config.partyField === 'supplier' ? (
                <SelectAutocomplete
                  disabled={!canEdit}
                  value={form.supplier}
                  onChange={(v) => setForm({ ...form, supplier: v })}
                  placeholder="Tìm / chọn công ty..."
                  options={[
                    { value: '', label: '-- Chọn công ty --' },
                    ...categories.map((c) => ({ value: c.name, label: c.name })),
                    ...(form.supplier && !categories.some((c) => c.name === form.supplier)
                      ? [{ value: form.supplier, label: form.supplier }]
                      : []),
                  ]}
                />
              ) : (
                <input
                  readOnly={!canEdit}
                  value={form.recipient}
                  onChange={(e) => setForm({ ...form, recipient: e.target.value })}
                />
              )}
            </label>
          </div>
          <div className="field full">
            <label>Ghi chú<textarea readOnly={!canEdit} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
          </div>
        </div>

        <div className="slip-lines">
          <table className="table table--compact">
            <thead>
              <tr>
                <th>Sản phẩm</th>
                <th>Hãng</th>
                <th className="text-right">Tồn</th>
                <th>Số lượng</th>
                <th>Ghi chú dòng</th>
                {canEdit && <th />}
              </tr>
            </thead>
            <tbody>
              {form.items.map((item, idx) => {
                const productId = resolveProductId(item.productId) || item.productId;
                const p = productMap.get(productId);
                return (
                  <tr key={idx}>
                    <td>
                      <SelectAutocomplete
                        disabled={!canEdit}
                        value={productId ? String(productId) : ''}
                        onChange={(v) => updateItem(idx, { productId: Number(v) || 0 })}
                        placeholder="Tìm sản phẩm..."
                        options={[
                          { value: '', label: '-- Chọn sản phẩm --' },
                          ...products.map((pr) => ({
                            value: String(pr.id),
                            label: `${pr.code} — ${pr.name}`,
                          })),
                        ]}
                      />
                    </td>
                    <td>{p?.brand || '—'}</td>
                    <td className="text-right mono">{p ? `${formatNumber(p.stock)} ${p.unit}` : '—'}</td>
                    <td>
                      <input type="number" className="input" min={1} step={1} disabled={!canEdit} value={item.quantity} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })} />
                    </td>
                    <td>
                      <input className="input" disabled={!canEdit} maxLength={200} value={item.note} onChange={(e) => updateItem(idx, { note: e.target.value })} />
                    </td>
                    {canEdit && (
                      <td>
                        <button type="button" className="btn btn--danger-ghost btn--sm" onClick={() => removeLine(idx)} title="Xóa dòng">×</button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {canEdit && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setForm((f) => ({ ...f, items: [...f.items, { productId: 0, quantity: 1, note: '' }] }))}>
            + Thêm dòng
          </button>
        )}
      </Modal>
    </>
  );
}

export function ExportSlipsPage() { return <SlipFormPage config={EXPORT_CONFIG} />; }
export function ImportSlipsPage() { return <SlipFormPage config={IMPORT_CONFIG} />; }
