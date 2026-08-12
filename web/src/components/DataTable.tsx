import { useEffect, useMemo, useState } from 'react';
import { PAGE_SIZE_OPTIONS } from '../constants';

type Col<T> = {
  key: string;
  label: string;
  render?: (row: T, absoluteIndex: number) => React.ReactNode;
  sortable?: boolean;
  className?: string;
};

type Props<T> = {
  columns: Col<T>[];
  rows: T[];
  searchKeys?: (keyof T)[];
  searchPlaceholder?: string;
  actions?: (row: T) => React.ReactNode;
  pageSize?: number;
  toolbar?: React.ReactNode;
  showSearch?: boolean;
  showStt?: boolean;
  defaultSort?: { key: string; direction: 'asc' | 'desc' };
  emptyTitle?: string;
  emptyDesc?: string;
  rowClassName?: (row: T) => string;
  externalSearch?: string;
  getSortValue?: (row: T, key: string) => unknown;
};

export default function DataTable<T extends Record<string, unknown>>({
  columns,
  rows,
  searchKeys = [],
  searchPlaceholder = 'Tìm kiếm...',
  actions,
  pageSize: initialPageSize = 10,
  toolbar,
  showSearch,
  showStt = false,
  defaultSort,
  emptyTitle = 'Không có dữ liệu',
  emptyDesc = 'Thử thay đổi bộ lọc hoặc thêm dữ liệu mới.',
  rowClassName,
  externalSearch,
  getSortValue,
}: Props<T>) {
  const useSearch = showSearch ?? searchKeys.length > 0;
  const [internalSearch, setInternalSearch] = useState('');
  const search = externalSearch ?? internalSearch;

  const [sortKey, setSortKey] = useState<string | null>(defaultSort?.key ?? null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(defaultSort?.direction ?? 'asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  useEffect(() => {
    setPage(1);
  }, [search, rows.length, pageSize]);

  const filtered = useMemo(() => {
    let list = rows;
    if (useSearch && search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) =>
        searchKeys.some((k) => String(r[k] ?? '').toLowerCase().includes(q))
      );
    }
    if (sortKey) {
      list = [...list].sort((a, b) => {
        const av = getSortValue ? getSortValue(a, sortKey) : a[sortKey];
        const bv = getSortValue ? getSortValue(b, sortKey) : b[sortKey];
        const cmp = String(av ?? '').localeCompare(String(bv ?? ''), 'vi', { numeric: true });
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
    return list;
  }, [rows, search, searchKeys, sortKey, sortDir, useSearch, getSortValue]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const colSpan = columns.length + (showStt ? 1 : 0) + (actions ? 1 : 0);

  const toggleSort = (key: string, sortable?: boolean) => {
    if (!sortable) return;
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const from = filtered.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, filtered.length);

  return (
    <>
      {(useSearch || toolbar) && (
        <div className="toolbar">
          {useSearch && externalSearch === undefined && (
            <div className="toolbar__grow">
              <input
                type="search"
                className="input"
                placeholder={searchPlaceholder}
                value={internalSearch}
                onChange={(e) => {
                  setInternalSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          )}
          {toolbar}
        </div>
      )}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {showStt && <th>STT</th>}
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`${c.className || ''} ${c.sortable ? 'is-sortable' : ''} ${sortKey === c.key ? (sortDir === 'asc' ? 'is-sorted-asc' : 'is-sorted-desc') : ''}`.trim()}
                  onClick={() => toggleSort(c.key, c.sortable)}
                  data-sort={c.sortable ? c.key : undefined}
                  aria-sort={sortKey === c.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {c.label}
                </th>
              ))}
              {actions && <th>Thao tác</th>}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={colSpan}>
                  <div className="empty-state empty-state--compact">
                    <h3 className="empty-state__title">{emptyTitle}</h3>
                    <p className="empty-state__desc">{emptyDesc}</p>
                  </div>
                </td>
              </tr>
            ) : (
              pageRows.map((row, i) => {
                const absoluteIndex = (page - 1) * pageSize + i;
                return (
                  <tr key={absoluteIndex} className={rowClassName?.(row)}>
                    {showStt && <td>{absoluteIndex + 1}</td>}
                    {columns.map((c) => (
                      <td key={c.key} className={c.className}>
                        {c.render ? c.render(row, absoluteIndex) : String(row[c.key] ?? '')}
                      </td>
                    ))}
                    {actions && <td>{actions(row)}</td>}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div className="pagination">
        <div className="pagination__info">
          Hiển thị <strong>{from}</strong>–<strong>{to}</strong> / <strong>{filtered.length}</strong>
        </div>
        <div className="pagination__controls">
          <select
            className="select select--sm"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            aria-label="Số dòng mỗi trang"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}/trang</option>
            ))}
          </select>
          <button type="button" className="btn btn--ghost btn--sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Trước
          </button>
          <span className="pagination__page">{page}/{totalPages}</span>
          <button type="button" className="btn btn--ghost btn--sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Sau
          </button>
        </div>
      </div>
    </>
  );
}
