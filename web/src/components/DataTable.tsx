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
  serverMode?: boolean;
  total?: number;
  page?: number;
  pageSizeControlled?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  sortKey?: string | null;
  sortDir?: 'asc' | 'desc';
  onSortChange?: (key: string, dir: 'asc' | 'desc') => void;
  loading?: boolean;
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
  serverMode = false,
  total: serverTotal,
  page: serverPage,
  pageSizeControlled,
  onPageChange,
  onPageSizeChange,
  sortKey: serverSortKey,
  sortDir: serverSortDir,
  onSortChange,
  loading = false,
}: Props<T>) {
  const useSearch = showSearch ?? searchKeys.length > 0;
  const [internalSearch, setInternalSearch] = useState('');
  const search = externalSearch ?? internalSearch;

  const [sortKey, setSortKey] = useState<string | null>(defaultSort?.key ?? null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(defaultSort?.direction ?? 'asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const activeSortKey = serverMode ? (serverSortKey ?? null) : sortKey;
  const activeSortDir = serverMode ? (serverSortDir ?? 'asc') : sortDir;
  const activePage = serverMode ? (serverPage ?? 1) : page;
  const activePageSize = serverMode ? (pageSizeControlled ?? initialPageSize) : pageSize;

  useEffect(() => {
    if (!serverMode) setPage(1);
  }, [search, rows.length, pageSize, serverMode]);

  const filtered = useMemo(() => {
    if (serverMode) return rows;
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
  }, [rows, search, searchKeys, sortKey, sortDir, useSearch, getSortValue, serverMode]);

  const totalCount = serverMode ? (serverTotal ?? 0) : filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / activePageSize));
  const pageRows = serverMode ? rows : filtered.slice((page - 1) * pageSize, page * pageSize);
  const colSpan = columns.length + (showStt ? 1 : 0) + (actions ? 1 : 0);

  const toggleSort = (key: string, sortable?: boolean) => {
    if (!sortable) return;
    if (serverMode && onSortChange) {
      const nextDir = activeSortKey === key && activeSortDir === 'asc' ? 'desc' : 'asc';
      onSortChange(key, nextDir);
      return;
    }
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const from = totalCount === 0 ? 0 : (activePage - 1) * activePageSize + 1;
  const to = Math.min(activePage * activePageSize, totalCount);

  const goPage = (p: number) => {
    if (serverMode && onPageChange) onPageChange(p);
    else setPage(p);
  };

  const changePageSize = (size: number) => {
    if (serverMode && onPageSizeChange) onPageSizeChange(size);
    else {
      setPageSize(size);
      setPage(1);
    }
  };

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
      <div className={`table-wrap${loading ? ' table-wrap--loading' : ''}`}>
        <table className="table">
          <thead>
            <tr>
              {showStt && <th>STT</th>}
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`${c.className || ''} ${c.sortable ? 'is-sortable' : ''} ${activeSortKey === c.key ? (activeSortDir === 'asc' ? 'is-sorted-asc' : 'is-sorted-desc') : ''}`.trim()}
                  onClick={() => toggleSort(c.key, c.sortable)}
                  data-sort={c.sortable ? c.key : undefined}
                  aria-sort={activeSortKey === c.key ? (activeSortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {c.label}
                </th>
              ))}
              {actions && <th>Thao tác</th>}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && !loading ? (
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
                const absoluteIndex = (activePage - 1) * activePageSize + i;
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
        {loading && <div className="table-loading">Đang tải...</div>}
      </div>
      <div className="pagination">
        <div className="pagination__info">
          Hiển thị <strong>{from}</strong>–<strong>{to}</strong> / <strong>{totalCount}</strong>
        </div>
        <div className="pagination__controls">
          <select
            className="select select--sm"
            value={activePageSize}
            onChange={(e) => changePageSize(Number(e.target.value))}
            aria-label="Số dòng mỗi trang"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}/trang</option>
            ))}
          </select>
          <button type="button" className="btn btn--ghost btn--sm" disabled={activePage <= 1} onClick={() => goPage(activePage - 1)}>
            Trước
          </button>
          <span className="pagination__page">{activePage}/{totalPages}</span>
          <button type="button" className="btn btn--ghost btn--sm" disabled={activePage >= totalPages} onClick={() => goPage(activePage + 1)}>
            Sau
          </button>
        </div>
      </div>
    </>
  );
}
