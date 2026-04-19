'use client';

import { useState, useEffect } from 'react';
import { createSupabaseClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageState, setPageState] = useState<'checking' | 'invalid' | 'ready' | 'success'>('checking');

  useEffect(() => {
    (async () => {
      try {
        const supabase = createSupabaseClient();
        const params = new URLSearchParams(window.location.hash.replace('#', '?'));
        let accessToken = params.get('access_token');
        let refreshToken = params.get('refresh_token');
        let type = params.get('type');

        if (!accessToken) {
          const urlParams = new URLSearchParams(window.location.search);
          const code = urlParams.get('code');
          if (code) {
            const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
            if (exchangeErr) {
              console.error('[reset-password] Code exchange error:', exchangeErr.message);
              setPageState('invalid');
              return;
            }
          }
        } else if (accessToken && refreshToken) {
          const { error: sessionErr } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (sessionErr) {
            console.error('[reset-password] Set session error:', sessionErr.message);
            setPageState('invalid');
            return;
          }
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setPageState('ready');
        } else {
          setPageState('invalid');
        }
      } catch (err) {
        console.error('[reset-password] Init error:', err);
        setPageState('invalid');
      }
    })();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('Mật khẩu phải có ít nhất 6 ký tự');
      return;
    }
    if (password !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp');
      return;
    }

    setLoading(true);
    try {
      const supabase = createSupabaseClient();
      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) {
        setError(updateErr.message);
        return;
      }
      setPageState('success');
      await supabase.auth.signOut();
      setTimeout(() => router.replace('/'), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra');
    } finally {
      setLoading(false);
    }
  };

  if (pageState === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    );
  }

  if (pageState === 'invalid') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white p-6 md:p-8 rounded-2xl shadow-md w-full max-w-sm text-center">
          <div className="text-3xl mb-3">⚠️</div>
          <h1 className="text-lg font-bold text-gray-800 mb-2">Link không hợp lệ</h1>
          <p className="text-sm text-gray-500 mb-4">Link đặt lại mật khẩu đã hết hạn. Vui lòng yêu cầu gửi lại.</p>
          <a href="/" className="text-sm text-blue-600 hover:underline">← Quay lại đăng nhập</a>
        </div>
      </div>
    );
  }

  if (pageState === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white p-6 md:p-8 rounded-2xl shadow-md w-full max-w-sm text-center">
          <div className="text-3xl mb-3">✅</div>
          <h1 className="text-lg font-bold text-green-700 mb-2">Mật khẩu đã được cập nhật</h1>
          <p className="text-sm text-gray-500 mb-4">Đang chuyển về trang đăng nhập...</p>
          <a href="/" className="text-sm text-blue-600 hover:underline">← Đăng nhập ngay</a>
        </div>
      </div>
    );
  }

  const inputCls = 'w-full px-3 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white p-6 md:p-8 rounded-2xl shadow-md w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-3xl mb-2">🔑</div>
          <h1 className="text-xl font-bold text-blue-900">Đặt mật khẩu mới</h1>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mật khẩu mới</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className={inputCls}
              placeholder="Tối thiểu 6 ký tự"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Xác nhận mật khẩu</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className={inputCls}
              placeholder="Nhập lại mật khẩu"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg text-sm transition-colors disabled:opacity-50 min-h-[44px]"
          >
            {loading ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
          </button>
        </form>
      </div>
    </div>
  );
}
