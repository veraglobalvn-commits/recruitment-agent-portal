'use client';

import { useState, useEffect } from 'react';
import { createSupabaseClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function CompleteProfilePage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageState, setPageState] = useState<'checking' | 'invalid' | 'ready' | 'success'>('checking');
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const supabase = createSupabaseClient();

        // Handle PKCE code from invite link if present
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        if (code) {
          const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeErr) {
            console.error('[complete-profile] Code exchange error:', exchangeErr.message);
            setPageState('invalid');
            return;
          }
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setPageState('invalid');
          return;
        }

        setUserId(session.user.id);

        // Use service role via API to bypass RLS
        const { data: userData } = await supabase
          .from('users')
          .select('full_name')
          .eq('supabase_uid', session.user.id)
          .maybeSingle();

        if (userData?.full_name) {
          router.replace('/');
          return;
        }

        setPageState('ready');
      } catch (err) {
        console.error('[complete-profile] Init error:', err);
        setPageState('invalid');
      }
    })();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) { setError('Please enter your full name'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    if (!userId) return;

    setLoading(true);
    setError(null);
    try {
      const supabase = createSupabaseClient();

      const { error: authErr } = await supabase.auth.updateUser({ password });
      if (authErr) throw authErr;

      const { error: dbErr } = await supabase
        .from('users')
        .update({ full_name: fullName.trim() })
        .eq('supabase_uid', userId);
      if (dbErr) throw dbErr;

      setPageState('success');
      setTimeout(() => {
        // After profile complete, route based on role
        supabase.auth.getUser().then(({ data: { user: u } }) => {
          if (u) {
            supabase.from('users').select('role').eq('supabase_uid', u.id).maybeSingle()
              .then(({ data: d }) => {
                if (d?.role === 'admin') router.replace('/admin');
                else router.replace('/');
              });
          } else {
            router.replace('/');
          }
        });
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
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
          <h1 className="text-lg font-bold text-gray-800 mb-2">Invalid Link</h1>
          <p className="text-sm text-gray-500 mb-4">This invite link has expired. Please request a new one.</p>
          <a href="/" className="text-sm text-blue-600 hover:underline">← Back to Login</a>
        </div>
      </div>
    );
  }

  if (pageState === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white p-6 md:p-8 rounded-2xl shadow-md w-full max-w-sm text-center">
          <div className="text-3xl mb-3">✅</div>
          <h1 className="text-lg font-bold text-green-700 mb-2">All done!</h1>
          <p className="text-sm text-gray-500">Redirecting to dashboard...</p>
        </div>
      </div>
    );
  }

  const inputCls = 'w-full px-3 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white p-6 md:p-8 rounded-2xl shadow-md w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-3xl mb-2">👋</div>
          <h1 className="text-xl font-bold text-blue-900">Complete Your Profile</h1>
          <p className="text-sm text-gray-500 mt-1">Set your name and password to get started</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className={inputCls}
              placeholder="John Smith"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password <span className="text-red-500">*</span></label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className={inputCls}
              placeholder="At least 6 characters"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password <span className="text-red-500">*</span></label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className={inputCls}
              placeholder="Re-enter your password"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg text-sm transition-colors disabled:opacity-50 min-h-[44px]"
          >
            {loading ? 'Saving...' : 'Get Started'}
          </button>
        </form>
      </div>
    </div>
  );
}
