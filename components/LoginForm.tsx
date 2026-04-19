'use client';

import { useState, useEffect } from 'react';

interface LoginFormProps {
  onSubmit: (e: React.FormEvent) => void;
  username: string;
  password: string;
  error: string | null;
  loading: boolean;
  onUsernameChange: (val: string) => void;
  onPasswordChange: (val: string) => void;
}

export default function LoginForm({
  onSubmit,
  username,
  password,
  error,
  loading,
  onUsernameChange,
  onPasswordChange,
}: LoginFormProps) {
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMsg, setForgotMsg] = useState<string | null>(null);

  useEffect(() => { setReady(true); }, []);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    );
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;
    setForgotLoading(true);
    setForgotMsg(null);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });
      const data = await res.json();
      setForgotMsg(data.message || 'Check your email for instructions');
    } catch {
      setForgotMsg('Something went wrong. Please try again.');
    } finally {
      setForgotLoading(false);
    }
  };

  if (mode === 'forgot') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white p-6 md:p-8 rounded-2xl shadow-md w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="text-3xl mb-2">🔑</div>
            <h1 className="text-xl font-bold text-blue-900">Forgot Password</h1>
            <p className="text-sm text-gray-500 mt-1">Enter your email to receive reset instructions</p>
          </div>

          {forgotMsg && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg">
              {forgotMsg}
            </div>
          )}

          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                required
                className="w-full px-3 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="your@email.com"
              />
            </div>
            <button
              type="submit"
              disabled={forgotLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg text-sm transition-colors disabled:opacity-50 min-h-[44px]"
            >
              {forgotLoading ? 'Sending...' : 'Send Instructions'}
            </button>
          </form>

          <button
            onClick={() => { setMode('login'); setForgotMsg(null); }}
            className="w-full mt-3 text-sm text-blue-600 hover:text-blue-800 py-2"
          >
            ← Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white p-6 md:p-8 rounded-2xl shadow-md w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-3xl mb-2">🌏</div>
          <h1 className="text-xl font-bold text-blue-900">Agent Portal</h1>
          <p className="text-sm text-gray-500 mt-1">Vietnam Recruitment</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={username}
              onChange={(e) => onUsernameChange(e.target.value)}
              required
              className="w-full px-3 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="your@email.com"
              autoComplete="email"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              required
              className="w-full px-3 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg text-sm transition-colors disabled:opacity-50 min-h-[44px]"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-3 flex flex-col gap-1">
          <button
            onClick={() => setMode('forgot')}
            className="w-full text-sm text-gray-500 hover:text-blue-600 py-2"
          >
            Forgot password?
          </button>
          <a
            href="/auth/register"
            className="w-full text-center text-sm text-blue-600 hover:text-blue-800 py-2"
          >
            Don&apos;t have an account? Register
          </a>
        </div>
      </div>
    </div>
  );
}
