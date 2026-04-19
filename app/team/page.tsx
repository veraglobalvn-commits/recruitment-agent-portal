'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

interface TeamMember {
  id: string;
  full_name: string | null;
  short_name: string | null;
  role: string | null;
  status: string | null;
  avatar_url: string | null;
}

interface NewMemberForm {
  email: string;
  full_name: string;
  agent_id: string;
}

function StatusPill({ status }: { status: string | null }) {
  if (status === 'active') return <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">Hoạt động</span>;
  if (status === 'inactive') return <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-600">Ngừng HD</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">{status || '—'}</span>;
}

export default function TeamPage() {
  const router = useRouter();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<NewMemberForm>({ email: '', full_name: '', agent_id: '' });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const loadTeam = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/'); return; }

      const res = await fetch('/api/agents/team', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json() as { members?: TeamMember[]; error?: string };
      if (!res.ok) {
        if (res.status === 401) { router.replace('/'); return; }
        setError(data.error || 'Không thể tải danh sách team');
        return;
      }
      setMembers(data.members || []);
    } catch {
      setError('Có lỗi xảy ra');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { loadTeam(); }, [loadTeam]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    if (!form.email.trim() || !form.full_name.trim() || !form.agent_id.trim()) {
      setCreateError('Vui lòng điền đầy đủ thông tin');
      return;
    }
    setCreating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/agents/team', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          email: form.email.trim(),
          full_name: form.full_name.trim(),
          agent_id: form.agent_id.trim(),
        }),
      });
      const data = await res.json() as { user?: TeamMember; credentials?: { email: string; password: string }; error?: string };
      if (!res.ok) {
        setCreateError(data.error || 'Tạo tài khoản thất bại');
        return;
      }
      setCreatedCredentials(data.credentials ?? null);
      setForm({ email: '', full_name: '', agent_id: '' });
      loadTeam();
    } catch {
      setCreateError('Có lỗi xảy ra');
    } finally {
      setCreating(false);
    }
  };

  const copyCredentials = () => {
    if (!createdCredentials) return;
    navigator.clipboard.writeText(`Email: ${createdCredentials.email}\nMật khẩu: ${createdCredentials.password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => router.back()} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-500 hover:text-gray-700">
          ←
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-slate-800">Quản lý thành viên</h1>
          <p className="text-xs text-gray-400">{members.length} thành viên</p>
        </div>
        <button
          onClick={() => { setShowModal(true); setCreatedCredentials(null); setCreateError(null); }}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-xl text-sm min-h-[44px] flex items-center gap-1.5 transition-colors"
        >
          + Thêm
        </button>
      </header>

      <div className="p-4 space-y-3 pb-24">
        {loading ? (
          <div className="space-y-3 animate-pulse">
            {[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-gray-200 rounded-2xl" />)}
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-gray-500 text-sm">{error}</p>
          </div>
        ) : members.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-300 text-4xl mb-3">👥</p>
            <p className="text-gray-500 text-sm">Chưa có thành viên nào</p>
            <p className="text-gray-400 text-xs mt-1">Thêm thành viên để họ hỗ trợ quản lý ứng viên</p>
          </div>
        ) : (
          members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
              <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${m.status === 'inactive' ? 'bg-red-100 text-red-400' : 'bg-teal-100 text-teal-700'}`}>
                {(m.full_name || m.id)[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-slate-800 truncate">{m.full_name || m.id}</p>
                <p className="text-xs text-gray-400 truncate">{m.id}</p>
              </div>
              <StatusPill status={m.status} />
            </div>
          ))
        )}
      </div>

      {/* Add Member Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-md p-6">
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4 sm:hidden" />

            {createdCredentials ? (
              <div className="space-y-4">
                <h2 className="text-base font-bold text-slate-800 text-center">Tài khoản đã tạo</h2>
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
                  <p className="text-sm"><span className="text-gray-500">Email:</span> <span className="font-semibold">{createdCredentials.email}</span></p>
                  <p className="text-sm"><span className="text-gray-500">Mật khẩu tạm:</span> <span className="font-mono font-semibold">{createdCredentials.password}</span></p>
                </div>
                <p className="text-xs text-orange-600 bg-orange-50 p-3 rounded-lg">Ghi lại thông tin này ngay. Mật khẩu tạm chỉ hiển thị một lần.</p>
                <button onClick={copyCredentials} className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 rounded-xl text-sm min-h-[44px] transition-colors">
                  {copied ? '✓ Đã sao chép' : 'Sao chép thông tin'}
                </button>
                <button onClick={() => setShowModal(false)} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl text-sm min-h-[44px] transition-colors">
                  Xong
                </button>
              </div>
            ) : (
              <form onSubmit={handleCreate} className="space-y-4">
                <h2 className="text-base font-bold text-slate-800">Thêm thành viên</h2>

                {createError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{createError}</div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Họ tên</label>
                  <input type="text" value={form.full_name} onChange={(e) => setForm(f => ({ ...f, full_name: e.target.value }))} required className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]" placeholder="Nguyễn Văn A" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input type="email" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} required className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]" placeholder="email@example.com" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ID hệ thống</label>
                  <input
                    type="text"
                    value={form.agent_id}
                    onChange={(e) => setForm(f => ({ ...f, agent_id: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') }))}
                    required
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px] font-mono"
                    placeholder="VD: NGUYEN_V_A"
                    maxLength={20}
                  />
                  <p className="text-xs text-gray-400 mt-1">Chỉ chữ hoa, số, dấu _. Không thể thay đổi sau khi tạo.</p>
                </div>

                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-3 rounded-xl text-sm font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 min-h-[44px] transition-colors">
                    Huỷ
                  </button>
                  <button type="submit" disabled={creating} className="flex-1 py-3 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white min-h-[44px] disabled:opacity-50 transition-colors">
                    {creating ? 'Đang tạo...' : 'Tạo tài khoản'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
