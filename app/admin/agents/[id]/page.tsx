'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { Candidate } from '@/lib/types';
import Link from 'next/link';

interface AgentData {
  id: string;
  full_name: string | null;
  short_name: string | null;
  role: string | null;
  labor_percentage: number | null;
}

interface OrderBrief {
  id: string;
  company_name: string | null;
  job_type: string | null;
  total_labor: number | null;
  labor_missing: number | null;
  status: string | null;
}

function StatusPill({ label }: { label: string | null }) {
  if (!label) return <span className="text-gray-400 text-xs">—</span>;
  const c: Record<string, string> = {
    'Đang tuyển': 'bg-amber-100 text-amber-700',
    'Đã tuyển đủ': 'bg-green-100 text-green-700',
  };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c[label] ?? 'bg-gray-100 text-gray-600'}`}>{label}</span>;
}

function InterviewPill({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">Pending</span>;
  if (status === 'Passed') return <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">Passed</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700">Failed</span>;
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
      <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [agent, setAgent] = useState<AgentData | null>(null);
  const [orders, setOrders] = useState<OrderBrief[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const [form, setForm] = useState({
    full_name: '',
    short_name: '',
    labor_percentage: '',
  });

  const setField = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const [agentRes, ordersRes, candidatesRes] = await Promise.all([
      supabase.from('agents').select('id, full_name, short_name, role, labor_percentage').eq('id', id).single(),
      supabase.from('orders').select('id, company_name, job_type, total_labor, labor_missing, status, agent_ids'),
      supabase.from('candidates').select('*').eq('agent_id', id),
    ]);

    if (agentRes.data) {
      const a = agentRes.data as AgentData;
      setAgent(a);
      setForm({
        full_name: a.full_name ?? '',
        short_name: a.short_name ?? '',
        labor_percentage: a.labor_percentage?.toString() ?? '',
      });
    }

    const allOrders = (ordersRes.data || []) as (OrderBrief & { agent_ids: string[] | null })[];
    setOrders(allOrders.filter((o) => (o.agent_ids || []).includes(id)));

    setCandidates((candidatesRes.data || []) as Candidate[]);
    setDirty(false);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleSave = useCallback(async () => {
    if (!agent) return;
    setSaving(true);
    setSaveMsg(null);

    const laborPercentageValue = form.labor_percentage ? parseInt(form.labor_percentage, 10) : null;

    if (laborPercentageValue !== null && (laborPercentageValue < 0 || laborPercentageValue > 100)) {
      setSaving(false);
      setSaveMsg('❌ % lao động phải từ 0 đến 100');
      return;
    }

    const { error } = await supabase.from('agents').update({
      full_name: form.full_name.trim() || null,
      short_name: form.short_name.trim() || null,
      labor_percentage: laborPercentageValue,
    }).eq('id', id);
    setSaving(false);
    if (error) { setSaveMsg(`❌ ${error.message}`); return; }
    setSaveMsg('✅ Đã lưu');
    setDirty(false);
    setTimeout(() => setSaveMsg(null), 3000);
  }, [id, agent, form]);

  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => { handleSave(); }, 1500);
    return () => clearTimeout(timer);
  }, [form, dirty, handleSave]);

  if (loading) {
    return (
      <div className="p-4 space-y-4 animate-pulse">
        <div className="h-12 bg-gray-200 rounded-xl" />
        <div className="h-24 bg-gray-200 rounded-2xl" />
        <div className="h-48 bg-gray-200 rounded-2xl" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500">Không tìm thấy agent</p>
        <Link href="/admin/agents" className="text-blue-600 text-sm mt-2 inline-block">← Quay lại</Link>
      </div>
    );
  }

  const displayName = agent.short_name || agent.full_name || 'Agent';
  const passedCount = candidates.filter((c) => c.interview_status === 'Passed').length;
  const totalTarget = orders.reduce((s, o) => s + (o.total_labor || 0), 0);

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
          className={`px-4 py-2 rounded-xl text-sm font-semibold min-h-[44px] transition-colors ${
            dirty ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-100 text-gray-400 cursor-default'
          }`}
        >
          {saving ? '...' : dirty ? 'Lưu *' : 'Đã lưu'}
        </button>
      </div>

      <div className="p-4 space-y-4">
        {saveMsg && <div className="sm:hidden p-3 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg text-center">{saveMsg}</div>}

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xl flex-shrink-0">
            {displayName[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-slate-800">{agent.full_name || '—'}</p>
            <p className="text-xs text-gray-400">{agent.role === 'agent' ? 'Agent BD' : agent.role}</p>
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
            <h2 className="text-sm font-semibold text-slate-700">Thông tin cơ bản</h2>
            {saving && <span className="text-xs text-blue-500 animate-pulse">Đang lưu...</span>}
          </div>
          <div className="p-4 space-y-3">
            <div><label className="block text-xs text-gray-500 mb-1">Họ tên</label><input type="text" value={form.full_name} onChange={(e) => setField('full_name', e.target.value)} placeholder="Nguyễn Văn A" className={inputCls} /></div>
            <div><label className="block text-xs text-gray-500 mb-1">Tên viết tắt</label><input type="text" value={form.short_name} onChange={(e) => setField('short_name', e.target.value)} placeholder="VD: Nam" className={inputCls} /></div>
            <div><label className="block text-xs text-gray-500 mb-1">% Lao động</label><input type="number" min="0" max="100" value={form.labor_percentage} onChange={(e) => setField('labor_percentage', e.target.value)} placeholder="VD: 50" className={inputCls} /></div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50">
            <h2 className="text-sm font-semibold text-slate-700">Đơn hàng phụ trách ({orders.length})</h2>
          </div>
          {orders.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-8">Chưa phụ trách đơn hàng nào</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {orders.map((o) => {
                const done = (o.total_labor ?? 0) - (o.labor_missing ?? o.total_labor ?? 0);
                return (
                  <Link key={o.id} href={`/admin/orders/${encodeURIComponent(o.id)}`}
                    className="block px-4 py-3 hover:bg-gray-50 transition-colors">
                    <div className="flex justify-between items-start mb-1.5 gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-blue-600 truncate">{o.id}</p>
                        <p className="text-xs text-gray-500">{o.company_name || '—'} · {o.job_type || '—'}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <StatusPill label={o.status} />
                        <span className="text-xs text-gray-600 font-semibold">{done}/{o.total_labor ?? 0}</span>
                      </div>
                    </div>
                    <ProgressBar value={done} max={o.total_labor ?? 0} />
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Ứng viên ({candidates.length})</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-green-600 font-medium">{passedCount} passed</span>
              <span className="text-xs text-gray-400">/ {totalTarget} chỉ tiêu</span>
            </div>
          </div>
          {candidates.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-8">Chưa có ứng viên nào</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {candidates.map((c) => (
                <div key={c.id_ld} className="px-4 py-3 flex items-center gap-3">
                  <div className="flex-shrink-0">
                    {c.photo_link ? (
                      <img src={c.photo_link} alt={c.full_name ?? ''} className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-xs font-bold">
                        {(c.full_name || '?')[0].toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{c.full_name || 'N/A'}</p>
                    <p className="text-xs text-gray-400">
                      PP: {c.pp_no || '—'}
                      {c.order_id && (
                        <Link href={`/admin/orders/${encodeURIComponent(c.order_id)}`} className="text-blue-600 hover:underline ml-2">
                          {c.order_id}
                        </Link>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <InterviewPill status={c.interview_status} />
                    <span className="text-xs text-gray-400">{c.visa_status || 'Pending'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
