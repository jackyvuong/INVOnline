import { GoogleOAuthProvider } from '@react-oauth/google';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ConfirmProvider } from './components/ConfirmProvider';
import Layout from './components/Layout';
import { SearchProvider } from './context/SearchContext';
import CategoriesPage from './pages/CategoriesPage';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import ProductsPage from './pages/ProductsPage';
import ReportPage from './pages/ReportPage';
import SettingsPage from './pages/SettingsPage';
import { ExportSlipsPage, ImportSlipsPage } from './pages/SlipsPage';
import StockPage from './pages/StockPage';
import TransactionsPage from './pages/TransactionsPage';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

function Protected({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <BrowserRouter>
          <ConfirmProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                path="/"
                element={
                  <Protected>
                    <SearchProvider>
                      <Layout />
                    </SearchProvider>
                  </Protected>
                }
              >
                <Route index element={<DashboardPage />} />
                <Route path="categories" element={<CategoriesPage />} />
                <Route path="products" element={<ProductsPage />} />
                <Route path="transactions" element={<TransactionsPage />} />
                <Route path="export-slips" element={<ExportSlipsPage />} />
                <Route path="import-slips" element={<ImportSlipsPage />} />
                <Route path="stock" element={<StockPage />} />
                <Route path="report" element={<ReportPage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ConfirmProvider>
        </BrowserRouter>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}
