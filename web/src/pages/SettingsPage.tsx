import { useEffect, useRef, useState } from 'react';
import { api, downloadJson } from '../api/client';
import { useConfirm } from '../components/ConfirmProvider';
import Modal from '../components/Modal';
import { Panel } from '../components/Panel';
import { formatDateTime } from '../utils/format';
import { notify } from '../utils/notification';

type AppUser = {
  id: number;
  email: string;
  displayName: string;
  isActive: boolean;
  lastLoginAt?: string | null;
};

function previewLegacyJson(text: string) {
  const data = JSON.parse(text) as Record<string, unknown>;
  if (!Array.isArray(data.products)) throw new Error('File JSON thiếu mảng products.');
  if (!Array.isArray(data.transactions)) throw new Error('File JSON thiếu mảng transactions.');
  return {
    products: data.products.length,
    transactions: data.transactions.length,
  };
}

function formatWhen(iso?: string | null) {
  if (!iso) return 'Chưa đăng nhập';
  return formatDateTime(iso) || iso;
}

export default function SettingsPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const repairRef = useRef<HTMLInputElement>(null);
  const { confirmDialog } = useConfirm();
  const [importing, setImporting] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [userOpen, setUserOpen] = useState(false);
  const [userForm, setUserForm] = useState({ email: '', displayName: '' });
  const [userErrors, setUserErrors] = useState<Record<string, string>>({});

  const loadUsers = () => api<AppUser[]>('/users').then(setUsers);
  useEffect(() => { loadUsers(); }, []);

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await api<Record<string, unknown>>('/settings/export');
      const stamp = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '');
      downloadJson(`qltk-backup-${stamp}.json`, data);
      notify.success('Đã tải file JSON backup về máy.');
    } catch (err: unknown) {
      notify.error((err as { message?: string }).message || 'Export thất bại.');
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (file: File) => {
    let text: string;
    let parsed: { products: number; transactions: number };
    try {
      text = await file.text();
      parsed = previewLegacyJson(text);
    } catch (err: unknown) {
      notify.error((err as { message?: string }).message || 'File JSON không hợp lệ.');
      return;
    }

    const ok = await confirmDialog({
      title: 'Import dữ liệu',
      message: `File "${file.name}" — ${parsed.products} sản phẩm, ${parsed.transactions} giao dịch.\n\nGhi đè toàn bộ dữ liệu hiện tại. Tiếp tục?`,
      confirmText: 'Import',
      danger: true,
    });
    if (!ok) return;

    setImporting(true);
    try {
      await api('/settings/import', { method: 'POST', body: text });
      notify.success('Import thành công.');
      window.location.reload();
    } catch (err: unknown) {
      notify.error((err as { message?: string }).message || 'Import thất bại.');
    } finally {
      setImporting(false);
    }
  };

  const handleRepair = async (file: File) => {
    let text: string;
    let parsed: { products: number; transactions: number };
    try {
      text = await file.text();
      parsed = previewLegacyJson(text);
    } catch (err: unknown) {
      notify.error((err as { message?: string }).message || 'File JSON không hợp lệ.');
      return;
    }

    const ok = await confirmDialog({
      title: 'Sửa lệch import (không xóa dữ liệu mới)',
      message: `File "${file.name}" — ${parsed.products} sản phẩm, ${parsed.transactions} giao dịch.\n\nChỉ sửa phiếu/giao dịch trùng mã: map lại sản phẩm theo mã, chỉnh ngày giờ VN. Không xóa sản phẩm hay phiếu tạo sau này. Tiếp tục?`,
      confirmText: 'Sửa dữ liệu',
      danger: false,
    });
    if (!ok) return;

    setRepairing(true);
    try {
      const result = await api<{ summary?: { exportSlipsUpdated?: number; importSlipsUpdated?: number; transactionsUpdated?: number } }>(
        '/settings/repair',
        { method: 'POST', body: text },
      );
      const s = result.summary;
      notify.success(
        `Đã sửa ${s?.exportSlipsUpdated ?? 0} phiếu xuất, ${s?.importSlipsUpdated ?? 0} phiếu nhập, ${s?.transactionsUpdated ?? 0} giao dịch.`,
      );
    } catch (err: unknown) {
      notify.error((err as { message?: string }).message || 'Sửa dữ liệu thất bại.');
    } finally {
      setRepairing(false);
    }
  };

  const saveUser = async () => {
    try {
      await api('/users', {
        method: 'POST',
        body: JSON.stringify({ email: userForm.email.trim(), displayName: userForm.displayName.trim() }),
      });
      setUserOpen(false);
      setUserForm({ email: '', displayName: '' });
      loadUsers();
      notify.success('Đã thêm user. User có thể đăng nhập Google bằng email này.');
    } catch (e: unknown) {
      const err = e as { errors?: Record<string, string>; message?: string };
      setUserErrors(err.errors || { _: err.message || 'Lỗi' });
      if (err.message) notify.error(err.message);
    }
  };

  const removeUser = async (user: AppUser) => {
    const ok = await confirmDialog({
      title: 'Xóa user',
      message: `Xóa quyền đăng nhập của "${user.email}"?`,
      confirmText: 'Xóa',
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/users/${user.id}`, { method: 'DELETE' });
      loadUsers();
      notify.success('Đã xóa user.');
    } catch (e: unknown) {
      notify.error((e as { message?: string }).message || 'Không xóa được user.');
    }
  };

  return (
    <>
      <Panel title="Sao lưu dữ liệu">
        <p className="field-hint">
          Export tải file JSON về máy để backup. Import ghi đè toàn bộ dữ liệu.
          Nếu prod đã import lệch (sai sản phẩm / lệch giờ), dùng <strong>Sửa lệch import</strong> với file JSON hệ thống cũ — không xóa phiếu hay sản phẩm tạo sau này.
        </p>
        <div className="toolbar toolbar--compact">
          <button
            type="button"
            className="btn btn--primary"
            disabled={exporting || importing || repairing}
            onClick={handleExport}
          >
            {exporting ? 'Đang export...' : 'Export JSON'}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={importing || exporting || repairing}
            onClick={() => fileRef.current?.click()}
          >
            {importing ? 'Đang import...' : 'Import JSON'}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={importing || exporting || repairing}
            onClick={() => repairRef.current?.click()}
          >
            {repairing ? 'Đang sửa...' : 'Sửa lệch import'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) await handleImport(f);
            }}
          />
          <input
            ref={repairRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) await handleRepair(f);
            }}
          />
        </div>
      </Panel>

      <Panel title="Quản lý user đăng nhập">
        <p className="field-hint">Thêm email Google được phép đăng nhập hệ thống. User lần đầu login sẽ tự liên kết tài khoản Google.</p>
        <div className="toolbar toolbar--compact">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              setUserForm({ email: '', displayName: '' });
              setUserErrors({});
              setUserOpen(true);
            }}
          >
            Thêm user
          </button>
        </div>
        <div className="table-wrap" style={{ marginTop: '1rem' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Tên hiển thị</th>
                <th>Đăng nhập gần nhất</th>
                <th className="col-actions">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={4} className="table-empty">Chưa có user nào.</td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.email}</td>
                    <td>{u.displayName || '—'}</td>
                    <td>{formatWhen(u.lastLoginAt)}</td>
                    <td className="col-actions">
                      <button type="button" className="btn btn--danger-ghost btn--sm" onClick={() => removeUser(u)}>
                        Xóa
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Modal
        open={userOpen}
        title="Thêm user"
        onClose={() => setUserOpen(false)}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setUserOpen(false)}>Hủy</button>
            <button type="button" className="btn btn--primary" onClick={saveUser}>Lưu</button>
          </>
        }
      >
        {userErrors._ && <p className="field-error field-error--block">{userErrors._}</p>}
        <div className="form-grid">
          <label className="field">
            <span className="field__label">Email Google *</span>
            <input
              type="email"
              className={`input${userErrors.email ? ' input--error' : ''}`}
              value={userForm.email}
              placeholder="user@gmail.com"
              onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
            />
            {userErrors.email && <span className="field-error">{userErrors.email}</span>}
          </label>
          <label className="field">
            <span className="field__label">Tên hiển thị</span>
            <input
              className="input"
              value={userForm.displayName}
              placeholder="Tùy chọn"
              onChange={(e) => setUserForm({ ...userForm, displayName: e.target.value })}
            />
          </label>
        </div>
      </Modal>
    </>
  );
}
