'use client';

import { useState, useEffect } from 'react';
import type { Agent, Agency } from '@/lib/types';
import { supabase } from '@/lib/supabase';

interface AddAgentModalProps {
  onClose: () => void;
  onSaved: (agent: Agent) => void;
  showRoleSelector?: boolean;
  showAgencySelector?: boolean;
  agencies?: Agency[];
}

export default function AddAgentModal({ onClose, onSaved, showRoleSelector, showAgencySelector }: AddAgentModalProps) {
  const [form, setForm] = useState({
    email: '',
    full_name: '',
    short_name: '',
    agent_id: '',
    role: 'agent',
    agency_id: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agencies, setAgencies] = useState<Agency[]>([]);

  const set = (k: keyof typeof form, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (showAgencySelector || form.role === 'manager' || form.role === 'operator') {
      const loadAgencies = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        const headers: Record<string, string> = {};
        if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
        try {
          const res = await fetch('/api/admin/agencies', { headers });
          const json = await res.json();
          setAgencies(json.agencies || []);
        } catch {}
      };
      loadAgencies();
    }
  }, [showAgencySelector, form.role]);

  const handleSave = async () => {
    if (!form.email.trim()) { setError('Email là bắt buộc'); return; }
    if (!form.full_name.trim()) { setError('Họ tên là bắt buộc'); return; }
    if (!form.agent_id.trim()) { setError('Agent ID là bắt buộc'); return; }

    const role = showRoleSelector ? form.role : 'agent';
    if ((role === 'manager' || role === 'operator') && !form.agency_id) {
      setError('Agency là bắt buộc cho manager/operator');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại');
        setSaving(false);
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('Không lấy được token, vui lòng đăng nhập lại');
        setSaving(false);
        return;
      }

      const res = await fetch('/api/agents/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          email: form.email.trim().toLowerCase(),
          full_name: form.full_name.trim(),
          short_name: form.short_name.trim() || undefined,
          agent_id: form.agent_id.trim().toUpperCase(),
          role,
          agency_id: form.agency_id || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Tạo tài khoản thất bại');
      }

      onSaved(data.agent as Agent);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const showAgencyField = showAgencySelector || form.role === 'manager' || form.role === 'operator';

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
          <h2 className="text-base font-bold text-gray-800">{showRoleSelector ? 'Thêm tài khoản' : 'Thêm Agent'}</h2>
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
            <p className="text-xs text-gray-400 mt-1">Lời mời sẽ được gửi qua email</p>
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
            <label className="block text-xs text-gray-500 mb-1">ID hệ thống <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.agent_id}
              onChange={(e) => set('agent_id', e.target.value.toUpperCase())}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px] font-mono"
            />
            <p className="text-xs text-gray-400 mt-1">VD: GTA, AMBA, GTA-MGR1</p>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Tên viết tắt</label>
            <input
              type="text"
              value={form.short_name}
              onChange={(e) => set('short_name', e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]"
            />
          </div>

          {showRoleSelector && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Vai trò</label>
              <select
                value={form.role}
                onChange={(e) => set('role', e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px] bg-white"
              >
                <option value="admin">Admin</option>
                <option value="agent">Agent (Owner)</option>
                <option value="manager">Manager</option>
                <option value="operator">Operator</option>
              </select>
            </div>
          )}

          {showAgencyField && agencies.length > 0 && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Agency</label>
              <select
                value={form.agency_id}
                onChange={(e) => set('agency_id', e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px] bg-white"
              >
                <option value="">— Chọn agency —</option>
                {agencies.map((ag) => (
                  <option key={ag.id} value={ag.id}>{ag.company_name || ag.id}</option>
                ))}
              </select>
            </div>
          )}
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
            {saving ? 'Đang gửi lời mời...' : 'Gửi lời mời'}
          </button>
        </div>
      </div>
    </div>
  );
}
