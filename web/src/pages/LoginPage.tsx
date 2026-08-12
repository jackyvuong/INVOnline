import { GoogleLogin } from '@react-oauth/google';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { APP_NAME } from '../constants';
import { useAuth } from '../auth/AuthContext';
import { notify } from '../utils/notification';

export default function LoginPage() {
  const { login, token } = useAuth();
  const navigate = useNavigate();

  if (token) {
    navigate('/', { replace: true });
    return null;
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">TK</div>
        <h1>{APP_NAME}</h1>
        <p>Đăng nhập bằng Google để tiếp tục</p>
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
          onError={() => notify.error('Google login lỗi')}
          useOneTap
          theme="filled_blue"
          size="large"
          text="signin_with"
          shape="rectangular"
        />
      </div>
    </div>
  );
}
