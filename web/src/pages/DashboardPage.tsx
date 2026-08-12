import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { StatusBadge, TypeBadge } from '../components/Badge';
import { formatNumber, STOCK_STATUS_LABELS } from '../constants';

export default function DashboardPage() {
  const [stats, setStats] = useState({ totalProducts: 0, totalStock: 0, lowCount: 0, outCount: 0 });
  const [recent, setRecent] = useState<Record<string, unknown>[]>([]);
  const [alerts, setAlerts] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    api<typeof stats>('/dashboard/stats').then(setStats);
    api<Record<string, unknown>[]>('/dashboard/recent-transactions').then(setRecent);
    api<Record<string, unknown>[]>('/dashboard/alerts').then(setAlerts);
  }, []);

  const cards = [
    { label: 'Tổng sản phẩm', value: stats.totalProducts, tone: 'primary' },
    { label: 'Tổng số lượng tồn', value: stats.totalStock, tone: 'info' },
    { label: 'Sắp hết hàng', value: stats.lowCount, tone: 'warning' },
    { label: 'Hết hàng', value: stats.outCount, tone: 'danger' },
  ];

  return (
    <>
      <section className="grid-stats" aria-label="Thống kê tổng quan">
        {cards.map((c) => (
          <article key={c.label} className={`stat-card stat-card--${c.tone}`}>
            <p className="stat-card__label">{c.label}</p>
            <p className="stat-card__value">{formatNumber(c.value)}</p>
          </article>
        ))}
      </section>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel__header">
            <h2 className="panel__title">5 giao dịch gần nhất</h2>
            <Link className="btn btn--ghost btn--sm" to="/transactions">
              Xem tất cả
            </Link>
          </div>
          <div className="panel__body">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Ngày</th>
                    <th>Loại</th>
                    <th>Sản phẩm</th>
                    <th className="text-right">Số lượng</th>
                    <th>Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.length === 0 ? (
                    <tr>
                      <td colSpan={5}>
                        <div className="empty-state empty-state--compact">
                          <h3 className="empty-state__title">Chưa có giao dịch</h3>
                          <p className="empty-state__desc">Tạo giao dịch tại mục Biến động tồn kho.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    recent.map((tx, i) => (
                      <tr key={i}>
                        <td>{String(tx.movementAt ?? '').slice(0, 16).replace('T', ' ')}</td>
                        <td>
                          <TypeBadge type={String(tx.type)} />
                        </td>
                        <td>
                          <div className="cell-primary">{String(tx.productCode)}</div>
                          <div className="cell-secondary">{String(tx.productName)}</div>
                        </td>
                        <td className={`text-right ${Number(tx.quantity) < 0 ? 'text-danger' : ''}`}>
                          {formatNumber(Number(tx.quantity))}
                        </td>
                        <td>{String(tx.note || '—')}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel__header">
            <h2 className="panel__title">Cảnh báo tồn kho</h2>
            <Link className="btn btn--ghost btn--sm" to="/stock">
              Tồn hiện tại
            </Link>
          </div>
          <div className="panel__body">
            {alerts.length === 0 ? (
              <div className="empty-state empty-state--compact">
                <p className="empty-state__desc">Không có sản phẩm cần cảnh báo.</p>
              </div>
            ) : (
              <ul className="alert-list">
                {alerts.map((p, i) => (
                  <li key={i} className="alert-list__item">
                    <div>
                      <div className="cell-primary">
                        {String(p.code)} — {String(p.name)}
                      </div>
                      <div className="cell-secondary">
                        Tồn: {formatNumber(Number(p.stock))} {String(p.unit || '')}
                      </div>
                    </div>
                    <StatusBadge status={String(p.status)} label={STOCK_STATUS_LABELS[String(p.status)]} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
