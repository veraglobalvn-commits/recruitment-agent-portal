'use client';

import { useState, useEffect } from 'react';
import { createSupabaseClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function CompleteProfilePage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState(false);
  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const supabase = createSupabaseClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setHasSession(true);
          setUserId(session.user.id);
          const { data } = await supabase
            .from('users')
            .select('full_name')
            .eq('supabase_uid', session.user.id)
            .maybeSingle();
          if (data?.full_name) {
            router.replace('/');
            return;
          }
        }
      } catch {}
      setChecking(false);
    })();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) { setError('Vui lòng nhập họ tên'); return; }
    if (!userId) return;

    setLoading(true);
    setError(null);
    try {
      const supabase = createSupabaseClient();
      const { error: dbErr } = await supabase
        .from('users')
        .update({ full_name: fullName.trim() })
        .eq('supabase_uid', userId);
      if (dbErr) throw dbErr;
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra');
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    );
  }

  if (!hasSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white p-6 md:p-8 rounded-2xl shadow-md w-full max-w-sm text-center">
          <div className="text-3xl mb-3">⚠️</div>
          <h1 className="text-lg font-bold text-gray-800 mb-2">Link không hợp lệ</h1>
          <p className="text-sm text-gray-500 mb-4">Link mời đã hết hạn.</p>
          <a href="/" className="text-sm text-blue-600 hover:underline">← Quay lại đăng nhập</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white p-6 md:p-8 rounded-2xl shadow-md w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-3xl mb-2">👋</div>
          <h1 className="text-xl font-bold text-blue-900">Hoàn tất hồ sơ</h1>
          <p className="text-sm text-gray-500 mt-1">Nhập họ tên để bắt đầu</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Họ tên</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="w-full px-3 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Nguyễn Văn A"
              autoFocus
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg text-sm transition-colors disabled:opacity-50 min-h-[44px]"
          >
            {loading ? 'Đang lưu...' : 'Bắt đầu'}
          </button>
        </form>
      </div>
    </div>
  );
}
