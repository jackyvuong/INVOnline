import { useCallback, useEffect, useState } from 'react';
import { apiPaged, type QueryParams } from '../api/client';
import { DEFAULT_PAGE_SIZE } from '../constants';

type Options = {
  defaultSort?: { key: string; direction: 'asc' | 'desc' };
  defaultPageSize?: number;
  search?: string;
  filters?: QueryParams;
};

export function usePagedList<T>(path: string, options: Options = {}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(options.defaultPageSize ?? DEFAULT_PAGE_SIZE);
  const [sortKey, setSortKey] = useState(options.defaultSort?.key ?? '');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(options.defaultSort?.direction ?? 'asc');
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const filters = options.filters ?? {};
  const search = options.search ?? '';
  const filtersKey = JSON.stringify(filters);

  const reload = useCallback(async (override?: QueryParams) => {
    setLoading(true);
    try {
      const result = await apiPaged<T>(path, {
        page,
        pageSize,
        search: search || undefined,
        sort: sortKey || undefined,
        dir: sortDir,
        ...filters,
        ...override,
      });
      setItems(result.items);
      setTotal(result.total);
    } finally {
      setLoading(false);
    }
  }, [path, page, pageSize, sortKey, sortDir, search, filtersKey]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    setPage(1);
  }, [search, pageSize, filtersKey]);

  const setSort = (key: string, dir: 'asc' | 'desc') => {
    setSortKey(key);
    setSortDir(dir);
    setPage(1);
  };

  const fetchAll = useCallback(async (extra: QueryParams = {}) => {
    const result = await apiPaged<T>(path, {
      page: 1,
      pageSize: 50000,
      search: search || undefined,
      sort: sortKey || undefined,
      dir: sortDir,
      ...filters,
      ...extra,
    });
    return result.items;
  }, [path, sortKey, sortDir, search, filtersKey]);

  return {
    items,
    total,
    page,
    pageSize,
    setPage,
    setPageSize,
    sortKey,
    sortDir,
    setSort,
    loading,
    reload,
    fetchAll,
  };
}
