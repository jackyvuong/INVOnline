export const APP_NAME = 'Quản Lý Tồn Kho';
export const APP_VERSION = '1.0.0';
export const PAGE_SIZE_OPTIONS = [5, 10, 20, 50] as const;
export const DEFAULT_PAGE_SIZE = 10;
export const UNIT_SUGGESTIONS = ['Cái', 'Hộp', 'Bộ', 'Kg'] as const;

export const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', path: '/', icon: 'dashboard' as const },
  { id: 'categories', label: 'Công Ty', path: '/categories', icon: 'categories' as const },
  { id: 'products', label: 'Quản lý sản phẩm', path: '/products', icon: 'products' as const },
  { id: 'transactions', label: 'Biến động tồn kho', path: '/transactions', icon: 'transactions' as const },
  { id: 'import-slips', label: 'Phiếu nhập kho', path: '/import-slips', icon: 'import-slips' as const },
  { id: 'export-slips', label: 'Phiếu xuất kho', path: '/export-slips', icon: 'export-slips' as const },
  { id: 'stock', label: 'Tồn hiện tại', path: '/stock', icon: 'stock' as const },
  { id: 'report', label: 'Báo cáo tồn kho', path: '/report', icon: 'report' as const },
  { id: 'settings', label: 'Cài đặt', path: '/settings', icon: 'settings' as const },
] as const;

export const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  IN: 'Nhập kho',
  OUT: 'Xuất kho',
  ADJUST: 'Điều chỉnh',
};

export const STOCK_STATUS_LABELS: Record<string, string> = {
  OK: 'Đủ hàng',
  LOW: 'Sắp hết',
  OUT: 'Hết hàng',
};

export const SLIP_STATUS_LABELS: Record<string, string> = {
  PROCESSING: 'Đang xử lý',
  COMPLETED: 'Hoàn thành',
  RETURNED: 'Hoàn trả',
};

export function getPageMeta(pathname: string) {
  const item = NAV_ITEMS.find((n) => n.path === pathname) ?? NAV_ITEMS[0];
  return { activePage: item.id, pageTitle: item.label };
}

export function formatNumber(n: number | string) {
  const num = Number(n);
  if (!Number.isFinite(num)) return String(n ?? '');
  return num.toLocaleString('vi-VN');
}
