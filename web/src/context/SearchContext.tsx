import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

type SearchContextValue = {
  search: string;
  setSearch: (v: string) => void;
};

const SearchContext = createContext<SearchContextValue>({ search: '', setSearch: () => {} });

export function SearchProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [search, setSearch] = useState('');

  useEffect(() => {
    setSearch('');
  }, [pathname]);

  const value = useMemo(() => ({ search, setSearch }), [search]);

  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}

export function useGlobalSearch() {
  return useContext(SearchContext);
}
