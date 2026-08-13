import { useEffect, useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { APP_NAME } from '../constants';
import { useAuth } from '../auth/AuthContext';
import { notify } from '../utils/notification';

export default function LoginPage() {
  const { login, token } = useAuth();
  const navigate = useNavigate();
  const [googleReady, setGoogleReady] = useState(false);

  useEffect(() => {
    if (token) navigate('/', { replace: true });
  }, [token, navigate]);

  useEffect(() => {
    setGoogleReady(true);
  }, []);

  if (token) return null;

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand" aria-hidden="true">TK</div>
        <h1>{APP_NAME}</h1>
        <p className="login-lead">Đăng nhập bằng tài khoản Google được cấp quyền</p>
        <div className="login-google">
          {googleReady && (
            <GoogleLogin
              onSuccess={async (res) => {
                if (!res.credential) return;
                try {
                  const data = await api<{ token: string; user: { email: string; displayName: string; avatarUrl?: string } }>(
                    '/auth/google',
                    { method: 'POST', body: JSON.stringify({ idToken: res.credential }) }
                  );
                  login(data.token, { email: data.user.email, displayName: data.user.displayName, avatarUrl: data.user.avatarUrl });
                  navigate('/', { replace: true });
                } catch (e: unknown) {
                  notify.error((e as { message?: string }).message || 'Đăng nhập thất bại');
                }
              }}
              onError={() => notify.error('Google login lỗi — thử lại hoặc kiểm tra popup bị chặn')}
              theme="outline"
              size="large"
              text="signin_with"
              shape="pill"
              width={320}
              logo_alignment="center"
              useOneTap={false}
            />
          )}
        </div>
        <p className="login-footnote">Chỉ email đã được thêm trong Cài đặt mới vào được hệ thống.</p>
      </div>
    </div>
  );
}
