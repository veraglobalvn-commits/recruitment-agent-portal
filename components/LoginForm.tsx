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
  useEffect(() => { setReady(true); }, []);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400 text-sm">Loading...</div>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Tên đăng nhập</label>
            <input
              type="text"
              value={username}
              onChange={(e) => onUsernameChange(e.target.value)}
              required
              className="w-full px-3 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Email hoặc ID tài khoản (VD: NAM_2026)"
              autoComplete="username"
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
      </div>
    </div>
  );
}
