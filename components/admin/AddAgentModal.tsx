'use client';

import { useState } from 'react';
import type { Agent } from '@/lib/types';
import { supabase } from '@/lib/supabase';

interface AddAgentModalProps {
  onClose: () => void;
  onSaved: (agent: Agent) => void;
}

export default function AddAgentModal({ onClose, onSaved }: AddAgentModalProps) {
  const [form, setForm] = useState({
    email: '',
    password: '',
    full_name: '',
    short_name: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);

  const set = (k: keyof typeof form, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.email.trim()) { setError('Email là bắt buộc'); return; }
    if (!form.password || form.password.length < 6) { setError('Mật khẩu phải có ít nhất 6 ký tự'); return; }
    if (!form.full_name.trim()) { setError('Họ tên là bắt buộc'); return; }

    setSaving(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/agents/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          email: form.email.trim().toLowerCase(),
          password: form.password,
          full_name: form.full_name.trim(),
          short_name: form.short_name.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Tạo agent thất bại');
      }

      onSaved(data.agent as Agent);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-3 sm:hidden flex-shrink-0" />

        <div className="flex justify-between items-center px-5 pt-4 pb-3 flex-shrink-0">
          <h2 className="text-base font-bold text-gray-800">Thêm Agent BD</h2>
          <button onClick={onClose} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-gray-700 text-xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>
          )}

          <div>
            <label className="block text-xs text-gray-500 mb-1">Email <span className="text-red-500">*</span></label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="agent@example.com"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Mật khẩu <span className="text-red-500">*</span></label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => set('password', e.target.value)}
                placeholder="Tối thiểu 6 ký tự"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 pr-12 focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 min-h-[36px] px-2"
              >
                {showPw ? 'Ẩn' : 'Hiện'}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Họ tên <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.full_name}
              onChange={(e) => set('full_name', e.target.value)}
              placeholder="Nguyễn Văn A"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Tên viết tắt</label>
            <input
              type="text"
              value={form.short_name}
              onChange={(e) => set('short_name', e.target.value)}
              placeholder="VD: Nam, Hoa..."
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]"
            />
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-2 flex-shrink-0">
          <button
            onClick={onClose}
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 rounded-xl text-sm min-h-[44px]"
          >
            Huỷ
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-50 min-h-[44px]"
          >
            {saving ? 'Đang tạo...' : 'Tạo Agent'}
          </button>
        </div>
      </div>
    </div>
  );
}
