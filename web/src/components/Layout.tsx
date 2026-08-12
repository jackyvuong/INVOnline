import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useGlobalSearch } from '../context/SearchContext';
import { APP_NAME, APP_VERSION, getPageMeta, NAV_ITEMS } from '../constants';
import { MenuIcon, NavIcon } from './icons';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { pageTitle } = getPageMeta(pathname);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { search, setSearch } = useGlobalSearch();

  return (
    <div className={`app-shell ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <aside className="sidebar" aria-label="Menu điều hướng">
        <div className="sidebar__brand">
          <div className="sidebar__logo" aria-hidden="true">
            TK
          </div>
          <div>
            <div className="sidebar__title">{APP_NAME}</div>
            <div className="sidebar__subtitle">Online Inventory</div>
          </div>
        </div>
        <nav className="sidebar__nav" aria-label="Menu chính">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.id}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) => `sidebar__link ${isActive ? 'is-active' : ''}`}
              onClick={() => setSidebarOpen(false)}
            >
              <NavIcon name={item.icon} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar__footer">
          <span>v{APP_VERSION}</span>
        </div>
      </aside>
      <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-hidden="true" />

      <div className="main">
        <header className="header">
          <div className="header__left">
            <button
              type="button"
              className="btn btn--icon header__menu-btn"
              aria-label="Mở menu"
              onClick={() => setSidebarOpen((v) => !v)}
            >
              {MenuIcon()}
            </button>
            <div>
              <h1 className="header__title">{pageTitle}</h1>
              <p className="header__app-name">{APP_NAME}</p>
            </div>
          </div>
          <div className="header__right">
            {pathname !== '/login' && pathname !== '/settings' && (
              <div className="header__search">
                <span className="header__search-icon" aria-hidden="true">⌕</span>
                <input
                  type="search"
                  id="global-search"
                  placeholder="Tìm kiếm nhanh..."
                  autoComplete="off"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            )}
            <div className="header__version" title="Phiên bản">v{APP_VERSION}</div>
            {user?.avatarUrl && <img src={user.avatarUrl} alt="" className="avatar" style={{ width: 32, height: 32, borderRadius: '50%' }} />}
            <span className="cell-secondary">{user?.displayName || user?.email}</span>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                logout();
                navigate('/login');
              }}
            >
              Đăng xuất
            </button>
          </div>
        </header>

        <main className="page">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
