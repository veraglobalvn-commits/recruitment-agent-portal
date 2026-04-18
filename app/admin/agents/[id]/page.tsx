'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { Candidate } from '@/lib/types';
import Link from 'next/link';

interface UserData {
  id: string;
  full_name: string | null;
  short_name: string | null;
  role: string | null;
  status: string | null;
  agency_id: string | null;
  permissions: string[] | null;
  avatar_url: string | null;
}

interface AgencyBrief {
  id: string;
  company_name: string | null;
  license_no: string | null;
}

interface OrderBrief {
  id: string;
  company_name: string | null;
  job_type: string | null;
  total_labor: number | null;
  labor_missing: number | null;
  status: string | null;
}

function RolePill({ role }: { role: string | null }) {
  const map: Record<string, string> = {
    admin: 'bg-purple-100 text-purple-700',
    agent: 'bg-blue-100 text-blue-600',
    manager: 'bg-indigo-100 text-indigo-700',
    operator: 'bg-gray-100 text-gray-600',
  };
  const labels: Record<string, string> = { admin: 'Admin', agent: 'Agent', manager: 'Manager', operator: 'Operator' };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[role || ''] || 'bg-gray-100 text-gray-600'}`}>{labels[role || ''] || role || '—'}</span>;
}

function InterviewPill({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">Pending</span>;
  if (status === 'Passed') return <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">Passed</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700">Failed</span>;
}

export default function UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = decodeURIComponent(params.id as string);

  const [user, setUser] = useState<UserData | null>(null);
  const [agency, setAgency] = useState<AgencyBrief | null>(null);
  const [orders, setOrders] = useState<OrderBrief[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [form, setForm] = useState({
    full_name: '',
    short_name: '',
    role: 'agent',
    status: 'active',
  });

  const setField = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
  };

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = {};
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

    try {
      const [userRes, ordersRes, candidatesRes] = await Promise.all([
        fetch(`/api/admin/agents/${encodeURIComponent(id)}`, { headers }).then(r => r.json()),
        supabase.from('orders').select('id, company_name, job_type, total_labor, labor_missing, status, agent_ids'),
        supabase.from('candidates').select('*').eq('agent_id', id),
      ]);

      if (userRes.error) {
        setLoadError(userRes.error);
        setLoading(false);
        return;
      }

      const userData = userRes.user as UserData;
      setUser(userData);
      setAgency(userRes.agency as AgencyBrief | null);

      if (userData) {
        setForm({
          full_name: userData.full_name ?? '',
          short_name: userData.short_name ?? '',
          role: userData.role ?? 'agent',
          status: userData.status ?? 'active',
        });
      } else {
        setLoadError(`Không tìm thấy user với ID: "${id}"`);
      }

      const allOrders = (ordersRes.data || []) as (OrderBrief & { agent_ids: string[] | null })[];
      setOrders(allOrders.filter((o) => (o.agent_ids || []).includes(id)));
      setCandidates((candidatesRes.data || []) as Candidate[]);
    } catch (err) {
      setLoadError('Lỗi tải dữ liệu');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setSaveMsg(null);

    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

    const res = await fetch(`/api/admin/agents/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        full_name: form.full_name.trim() || null,
        short_name: form.short_name.trim() || null,
        role: form.role,
        status: form.status,
      }),
    });

    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setSaveMsg(`❌ ${data.error}`); return; }
    setSaveMsg('✅ Đã lưu');
    setUser(data.user);
    setTimeout(() => setSaveMsg(null), 3000);
  };

  const handleToggleStatus = async () => {
    if (!user) return;
    const newStatus = user.status === 'inactive' ? 'active' : 'inactive';
    setSaving(true);
    setSaveMsg(null);

    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

    const res = await fetch(`/api/admin/agents/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: newStatus }),
    });

    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setSaveMsg(`❌ ${data.error}`); return; }
    setUser(data.user);
    setForm((f) => ({ ...f, status: newStatus }));
    setSaveMsg(`✅ ${newStatus === 'active' ? 'Đã kích hoạt' : 'Đã ngừng hoạt động'}`);
    setTimeout(() => setSaveMsg(null), 3000);
  };

  if (loading) {
    return (
      <div className="p-4 space-y-4 animate-pulse">
        <div className="h-12 bg-gray-200 rounded-xl" />
        <div className="h-24 bg-gray-200 rounded-2xl" />
        <div className="h-48 bg-gray-200 rounded-2xl" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500">{loadError || 'Không tìm thấy user'}</p>
        <Link href="/admin/users" className="text-blue-600 text-sm mt-2 inline-block">← Quay lại</Link>
      </div>
    );
  }

  const displayName = user.short_name || user.full_name || 'User';
  const passedCount = candidates.filter((c) => c.interview_status === 'Passed').length;
  const inputCls = 'w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]';

  return (
    <div className="pb-24">
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.back()} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-500 hover:text-gray-800 text-xl">←</button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate text-slate-800">{displayName}</p>
        </div>
        {saveMsg && <span className="text-xs text-green-600 font-medium hidden sm:inline">{saveMsg}</span>}
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-xl text-sm font-semibold min-h-[44px] bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? '...' : 'Lưu'}
        </button>
      </div>

      <div className="p-4 space-y-4">
        {saveMsg && <div className="sm:hidden p-3 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg text-center">{saveMsg}</div>}

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-4">
          <div className={`w-14 h-14 rounded-full flex items-center justify-center font-bold text-xl flex-shrink-0 ${user.status === 'inactive' ? 'bg-red-100 text-red-400' : user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
            {displayName[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-slate-800">{user.full_name || '—'}</p>
            <div className="flex items-center gap-2 mt-1">
              <RolePill role={user.role} />
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${user.status === 'inactive' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'}`}>
                {user.status === 'inactive' ? 'Ngừng HD' : 'Hoạt động'}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Đơn hàng', value: orders.length, color: 'text-slate-800' },
            { label: 'Ứng viên', value: candidates.length, color: 'text-blue-600' },
            { label: 'Trúng tuyển', value: passedCount, color: 'text-green-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 text-center">
              <p className="text-xs text-gray-500">{label}</p>
              <p className={`text-xl font-bold mt-0.5 ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Thông tin tài khoản</h2>
            {saving && <span className="text-xs text-blue-500 animate-pulse">Đang lưu...</span>}
          </div>
          <div className="p-4 space-y-3">
            <div><label className="block text-xs text-gray-500 mb-1">Họ tên</label><input type="text" value={form.full_name} onChange={(e) => setField('full_name', e.target.value)} className={inputCls} /></div>
            <div><label className="block text-xs text-gray-500 mb-1">Tên viết tắt</label><input type="text" value={form.short_name} onChange={(e) => setField('short_name', e.target.value)} className={inputCls} /></div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Vai trò</label>
              <select value={form.role} onChange={(e) => setField('role', e.target.value)} className={inputCls + ' bg-white'}>
                <option value="admin">Admin</option>
                <option value="agent">Agent (Owner)</option>
                <option value="manager">Manager</option>
                <option value="operator">Operator</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Trạng thái</label>
              <select value={form.status} onChange={(e) => setField('status', e.target.value)} className={inputCls + ' bg-white'}>
                <option value="active">Hoạt động</option>
                <option value="inactive">Ngừng hoạt động</option>
              </select>
            </div>
          </div>
        </div>

        {agency && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50">
              <h2 className="text-sm font-semibold text-slate-700">Agency</h2>
            </div>
            <div className="p-4">
              <Link href={`/admin/agencies/${agency.id}`} className="flex items-center gap-3 hover:bg-gray-50 -m-2 p-2 rounded-lg transition-colors">
                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
                  {(agency.company_name || agency.id)[0].toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">{agency.company_name || agency.id}</p>
                  <p className="text-xs text-gray-400">{agency.license_no || '—'}</p>
                </div>
                <span className="ml-auto text-xs text-blue-600">Xem →</span>
              </Link>
            </div>
          </div>
        )}

        {user.permissions && user.permissions.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50">
              <h2 className="text-sm font-semibold text-slate-700">Permissions ({user.permissions.length})</h2>
            </div>
            <div className="p-4 flex flex-wrap gap-1.5">
              {user.permissions.map((p) => (
                <span key={p} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-md">{p}</span>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={handleToggleStatus}
          disabled={saving}
          className={`w-full py-3 rounded-xl text-sm font-semibold min-h-[44px] transition-colors disabled:opacity-50 ${
            user.status === 'inactive'
              ? 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200'
              : 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
          }`}
        >
          {user.status === 'inactive' ? 'Kích hoạt lại' : 'Ngừng hoạt động'}
        </button>
      </div>
    </div>
  );
}
