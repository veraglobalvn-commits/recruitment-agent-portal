'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { Candidate, AdminOrder, AgentOption } from '@/lib/types';
import CandidateCard from '@/components/CandidateCard';
import Link from 'next/link';

const STATUS_OPTIONS = ['Đang tuyển', 'Đã tuyển đủ'];
const PAYMENT_OPTIONS = ['Chưa TT', 'TT lan 1', 'TT lan 2', 'TT lan 3', 'Đã TT'];

function fmtVnd(val: number | null | undefined) {
  if (!val) return '—';
  if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(1)}B ₫`;
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(0)}M ₫`;
  return val.toLocaleString('vi-VN') + ' ₫';
}

function StatusPill({ label }: { label: string | null }) {
  if (!label) return <span className="text-gray-400 text-xs">—</span>;
  const c: Record<string, string> = {
    'Đang tuyển': 'bg-amber-100 text-amber-700',
    'Đã tuyển đủ': 'bg-green-100 text-green-700',
    'Chưa TT': 'bg-red-100 text-red-600',
    'Đã TT': 'bg-green-100 text-green-700',
    'TT lan 1': 'bg-blue-100 text-blue-700',
    'TT lan 2': 'bg-indigo-100 text-indigo-700',
    'TT lan 3': 'bg-purple-100 text-purple-700',
  };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c[label] ?? 'bg-gray-100 text-gray-600'}`}>{label}</span>;
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
      <div className="bg-blue-500 h-2 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = decodeURIComponent(params.id as string);

  const [order, setOrder] = useState<AdminOrder | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [agentLaborAllocations, setAgentLaborAllocations] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [videoUploadingCandidate, setVideoUploadingCandidate] = useState<string | null>(null);
  const [showAgentDropdown, setShowAgentDropdown] = useState(false);

  const videoInputRef = useRef<HTMLInputElement>(null);

  const agentMap = new Map(agents.map((a) => [a.id, a]));

  const [form, setForm] = useState({
    job_type: '',
    total_labor: '',
    labor_missing: '',
    salary_usd: '',
    status: 'Đang tuyển',
    legal_status: '',
    agent_ids: [] as string[],
    total_fee_vn: '',
    service_fee_per_person: '',
    payment_status_vn: 'Chưa TT',
    url_demand_letter: '',
    url_order: '',
  });

  const setField = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  const totalLabor = parseInt(form.total_labor) || 0;
  const totalAllocatedLabor = form.agent_ids.reduce((sum, agentId) => {
    const allocation = parseInt(agentLaborAllocations[agentId] || '0') || 0;
    return sum + allocation;
  }, 0);
  const isLaborUnbalanced = totalLabor > 0 && totalAllocatedLabor !== totalLabor;

  const load = useCallback(async () => {
    setLoading(true);
    const [ordRes, candRes, agRes] = await Promise.all([
      supabase.from('orders').select('*').eq('id', id).single(),
      supabase.from('candidates').select('*').eq('order_id', id),
      supabase.from('agents').select('id, full_name, short_name, labor_percentage').neq('role', 'admin'),
    ]);

    if (ordRes.data) {
      const o = ordRes.data as AdminOrder;
      setOrder(o);
      setForm({
        job_type: o.job_type ?? '',
        total_labor: o.total_labor?.toString() ?? '',
        labor_missing: o.labor_missing?.toString() ?? '',
        salary_usd: o.salary_usd?.toString() ?? '',
        status: o.status ?? 'Đang tuyển',
        legal_status: o.legal_status ?? '',
        agent_ids: o.agent_ids ?? [],
        total_fee_vn: o.total_fee_vn?.toString() ?? '',
        service_fee_per_person: o.service_fee_per_person?.toString() ?? '',
        payment_status_vn: o.payment_status_vn ?? 'Chưa TT',
        url_demand_letter: o.url_demand_letter ?? '',
        url_order: o.url_order ?? '',
      });
    }
    setCandidates((candRes.data ?? []) as Candidate[]);
    const agentsData = (agRes.data ?? []) as (AgentOption & { labor_percentage: number | null })[];
    setAgents(agentsData);
    const allocations: Record<string, string> = {};
    agentsData.forEach((ag) => {
      const percentage = ag.labor_percentage ?? 0;
      const totalLabor = ordRes.data?.total_labor ?? 0;
      const allocation = percentage > 0 ? Math.round((percentage / 100) * totalLabor) : 0;
      allocations[ag.id] = allocation.toString();
    });
    setAgentLaborAllocations(allocations);
    setDirty(false);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleSave = useCallback(async () => {
    if (!order) return;
    setSaving(true);
    setSaveMsg(null);
    const { error } = await supabase.from('orders').update({
      job_type: form.job_type.trim() || null,
      total_labor: form.total_labor ? parseInt(form.total_labor) : null,
      labor_missing: form.labor_missing ? parseInt(form.labor_missing) : null,
      salary_usd: form.salary_usd ? parseFloat(form.salary_usd) : null,
      status: form.status || 'Đang tuyển',
      legal_status: form.legal_status.trim() || null,
      agent_ids: form.agent_ids.length > 0 ? form.agent_ids : null,
      total_fee_vn: form.total_fee_vn ? parseFloat(form.total_fee_vn) : null,
      service_fee_per_person: form.service_fee_per_person ? parseFloat(form.service_fee_per_person) : null,
      payment_status_vn: form.payment_status_vn || 'Chưa TT',
      url_demand_letter: form.url_demand_letter.trim() || null,
      url_order: form.url_order.trim() || null,
    }).eq('id', id);
    setSaving(false);
    if (error) { setSaveMsg(`❌ ${error.message}`); return; }
    setSaveMsg('✅ Đã lưu');
    setDirty(false);
    setTimeout(() => setSaveMsg(null), 3000);
  }, [id, order, form]);

  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => { handleSave(); }, 1500);
    return () => clearTimeout(timer);
  }, [form, dirty, handleSave]);

  const handleCandidateUpdate = useCallback((cid: string, updates: Partial<Candidate>) => {
    setCandidates((prev) => prev.map((c) => (c.id_ld === cid ? { ...c, ...updates } : c)));
  }, []);

  const handleStatusChange = useCallback(async (candidateId: string, status: 'Passed' | 'Failed') => {
    setCandidates((prev) => prev.map((c) => c.id_ld === candidateId ? { ...c, interview_status: status } : c));
    try {
      const { error } = await supabase.from('candidates').update({ interview_status: status }).eq('id_ld', candidateId);
      if (error) throw new Error(error.message);
    } catch (err) {
      alert(`Lỗi: ${err instanceof Error ? err.message : String(err)}`);
      setCandidates((prev) => prev.map((c) => c.id_ld === candidateId ? { ...c, interview_status: c.interview_status } : c));
    }
  }, []);

  const handleAgentAllocationChange = useCallback(async (agentId: string, value: string) => {
    const numValue = value ? parseInt(value, 10) : null;
    if (numValue !== null && numValue < 0) {
      alert('Số người phải lớn hơn hoặc bằng 0');
      return;
    }
    setAgentLaborAllocations((prev: Record<string, string>) => ({ ...prev, [agentId]: value }));
    try {
      const totalLabor = parseInt(form.total_labor) || 0;
      const percentage = totalLabor > 0 && numValue !== null ? Math.round((numValue / totalLabor) * 100) : null;
      const { error } = await supabase.from('agents').update({ labor_percentage: percentage }).eq('id', agentId);
      if (error) throw error;
    } catch (err) {
      alert(`Lỗi lưu số người: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [form.total_labor]);

  const handleVideoUploadClick = useCallback((candidateId: string) => {
    setVideoUploadingCandidate(candidateId);
    videoInputRef.current?.click();
  }, []);

  const handleVideoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !videoUploadingCandidate) return;
    const fileExt = file.name.split('.').pop();
    const safeOrderId = id.replace(/[^a-zA-Z0-9-]/g, '_');
    const safeCandidateId = videoUploadingCandidate.replace(/[^a-zA-Z0-9-]/g, '_');
    const filePath = `${safeOrderId}/${safeCandidateId}/${Date.now()}.${fileExt}`;
    try {
      const { error } = await supabase.storage.from('agent-media').upload(filePath, file, { cacheControl: '3600', upsert: false });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('agent-media').getPublicUrl(filePath);
      await supabase.from('candidates').update({ video_link: urlData.publicUrl }).eq('id_ld', videoUploadingCandidate);
      handleCandidateUpdate(videoUploadingCandidate, { video_link: urlData.publicUrl });

      const notifyUrl = process.env.NEXT_PUBLIC_N8N_VIDEO_NOTIFY_URL;
      if (notifyUrl) {
        const candidate = candidates.find((c) => c.id_ld === videoUploadingCandidate);
        fetch(notifyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            candidate_id: videoUploadingCandidate,
            full_name: candidate?.full_name ?? '',
            order_id: id,
            video_link: urlData.publicUrl,
          }),
        }).catch(() => {});
      }
    } catch (err) {
      alert(`Upload lỗi: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (videoInputRef.current) videoInputRef.current.value = '';
      setVideoUploadingCandidate(null);
    }
  };

  if (loading) {
    return (
      <div className="p-4 space-y-4 animate-pulse">
        <div className="h-12 bg-gray-200 rounded-xl" />
        <div className="h-64 bg-gray-200 rounded-2xl" />
        <div className="h-48 bg-gray-200 rounded-2xl" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500">Không tìm thấy đơn hàng</p>
        <Link href="/admin/orders" className="text-blue-600 text-sm mt-2 inline-block">← Quay lại</Link>
      </div>
    );
  }

  const laborMissing = parseInt(form.labor_missing) || 0;
  const done = totalLabor - laborMissing;
  const passedCount = candidates.filter((c) => c.interview_status === 'Passed').length;

  const inputCls = 'w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]';

  return (
    <div className="pb-24">
      <input type="file" accept="video/*" ref={videoInputRef} onChange={handleVideoChange} className="hidden" />

      <div className="sticky top-0 z-20 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.back()} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-500 hover:text-gray-800 text-xl">←</button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate text-slate-800">{order.id}</p>
          {order.company_name && <p className="text-xs text-gray-400 truncate">{order.company_name}</p>}
        </div>
        <StatusPill label={form.status} />
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

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-slate-800">{order.company_name || '—'}</p>
            {order.company_id && (
              <Link href={`/admin/companies/${order.company_id}`} className="text-xs text-blue-600 hover:underline">
                Xem công ty →
              </Link>
            )}
          </div>
          {totalLabor > 0 && (
            <div className="mb-3">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-gray-500">Tiến độ tuyển dụng</span>
                <span className="font-semibold text-slate-700">{done}/{totalLabor} · {passedCount} passed</span>
              </div>
              <ProgressBar value={done} max={totalLabor} />
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Thông tin đơn hàng</h2>
            {saving && <span className="text-xs text-blue-500 animate-pulse">Đang lưu...</span>}
          </div>
          <div className="p-4 space-y-3">
            <div><label className="block text-xs text-gray-500 mb-1">Vị trí / Loại lao động</label><input type="text" value={form.job_type} onChange={(e) => setField('job_type', e.target.value)} placeholder="Công nhân nhà máy" className={inputCls} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="block text-xs text-gray-500 mb-1">Số LĐ</label><input type="number" value={form.total_labor} onChange={(e) => setField('total_labor', e.target.value)} placeholder="50" className={inputCls} /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Còn thiếu</label><input type="number" value={form.labor_missing} onChange={(e) => setField('labor_missing', e.target.value)} placeholder="20" className={inputCls} /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Lương (USD)</label><input type="number" value={form.salary_usd} onChange={(e) => setField('salary_usd', e.target.value)} placeholder="650" className={inputCls} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs text-gray-500 mb-1">Trạng thái</label><select value={form.status} onChange={(e) => setField('status', e.target.value)} className={`${inputCls} bg-white`}>{STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
              <div><label className="block text-xs text-gray-500 mb-1">Pháp lý</label><input type="text" value={form.legal_status} onChange={(e) => setField('legal_status', e.target.value)} placeholder="VD: Đã phê duyệt" className={inputCls} /></div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
            <h2 className={`text-sm font-semibold ${isLaborUnbalanced ? 'text-red-600' : 'text-slate-700'}`}>Agent phụ trách</h2>
            <div className="relative">
              <button
                onClick={() => setShowAgentDropdown(!showAgentDropdown)}
                className="text-xs text-blue-600 hover:underline"
              >
                + Thêm agent
              </button>
              {showAgentDropdown && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                  {agents.filter((ag) => !form.agent_ids.includes(ag.id)).length === 0 ? (
                    <div className="p-2 text-xs text-gray-400 text-center">Không có agent nào</div>
                  ) : (
                    agents.filter((ag) => !form.agent_ids.includes(ag.id)).map((ag) => (
                      <button
                        key={ag.id}
                        onClick={() => {
                          setForm((f) => ({
                            ...f,
                            agent_ids: [...f.agent_ids, ag.id],
                          }));
                          setDirty(true);
                          setShowAgentDropdown(false);
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg"
                      >
                        {ag.short_name || ag.full_name}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="p-4">
            {isLaborUnbalanced && (
              <div className="mb-3 p-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg text-center">
                ⚠️ Tổng số lao động phân công ({totalAllocatedLabor}) không bằng tổng số cần tuyển ({totalLabor})
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {agents.filter((ag) => form.agent_ids.includes(ag.id)).map((ag) => {
                const agentWithPercentage = ag as AgentOption & { labor_percentage: number | null };
                const allocation = agentLaborAllocations[ag.id] || '';
                const allocatedLabor = parseInt(allocation) || 0;
                const percentage = totalLabor > 0 ? Math.round((allocatedLabor / totalLabor) * 100) : 0;
                const passedCount = candidates.filter((c) => c.agent_id === ag.id && c.interview_status === 'Passed').length;

                return (
                  <div key={ag.id} className="p-2 rounded border border-blue-200 bg-blue-50">
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="checkbox"
                        checked={true}
                        onChange={() => {
                          setForm((f) => ({
                            ...f,
                            agent_ids: f.agent_ids.filter((x) => x !== ag.id),
                          }));
                          setDirty(true);
                        }}
                        className="rounded text-blue-600 focus:ring-blue-400"
                      />
                      <span className="text-sm text-gray-700 font-medium flex-1">{ag.short_name || ag.full_name}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Số người</label>
                        <input
                          type="number"
                          min="0"
                          value={allocation}
                          onChange={(e) => handleAgentAllocationChange(ag.id, e.target.value)}
                          placeholder="0"
                          className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-400"
                        />
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500">Tỷ lệ</p>
                        <p className="text-sm font-semibold text-gray-700">{percentage}%</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500">Đã tuyển</p>
                        <p className="text-sm font-semibold text-green-600">{passedCount}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {form.agent_ids.length === 0 && (
              <div className="text-center py-4">
                <p className="text-xs text-gray-400 mb-2">Chưa chọn agent nào</p>
                <button
                  onClick={() => setShowAgentDropdown(!showAgentDropdown)}
                  className="text-xs text-blue-600 hover:underline"
                >
                  + Thêm agent
                </button>
              </div>
            )}
            {form.agent_ids.length > 0 && totalLabor > 0 && (
              <div className={`mt-2 text-xs text-center ${isLaborUnbalanced ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                Tổng phân công: {totalAllocatedLabor} / {totalLabor} người
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50">
            <h2 className="text-sm font-semibold text-slate-700">Thanh toán</h2>
          </div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div><label className="block text-xs text-gray-500 mb-1">Tổng phí DV</label><input type="number" value={form.total_fee_vn} onChange={(e) => setField('total_fee_vn', e.target.value)} placeholder="500000000" className={inputCls} /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Phí/người</label><input type="number" value={form.service_fee_per_person} onChange={(e) => setField('service_fee_per_person', e.target.value)} placeholder="10000000" className={inputCls} /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Trạng thái TT</label><select value={form.payment_status_vn} onChange={(e) => setField('payment_status_vn', e.target.value)} className={`${inputCls} bg-white`}>{PAYMENT_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
            </div>
            {form.total_fee_vn && (
              <div className="text-xs text-gray-400 text-right">
                {fmtVnd(parseFloat(form.total_fee_vn))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50">
            <h2 className="text-sm font-semibold text-slate-700">Tài liệu</h2>
          </div>
          <div className="p-4 space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Demand Letter (URL)</label>
              <input type="url" value={form.url_demand_letter} onChange={(e) => setField('url_demand_letter', e.target.value)} placeholder="https://..." className={inputCls} />
              {form.url_demand_letter && (
                <a href={form.url_demand_letter} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline mt-1 inline-block">📄 Mở Demand Letter ↗</a>
              )}
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Recruitment File (URL)</label>
              <input type="url" value={form.url_order} onChange={(e) => setField('url_order', e.target.value)} placeholder="https://..." className={inputCls} />
              {form.url_order && (
                <a href={form.url_order} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline mt-1 inline-block">📎 Mở Recruitment File ↗</a>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Ứng viên ({candidates.length})</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-green-600 font-medium">{passedCount} passed</span>
              <span className="text-xs text-gray-400">/ {candidates.length}</span>
            </div>
          </div>
          <div className="p-4">
            {candidates.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-8">Chưa có ứng viên nào</p>
            ) : (
              <div className="space-y-3">
                {candidates.map((c) => (
                  <CandidateCard
                    key={c.id_ld}
                    candidate={c}
                    orderId={id}
                    onStatusChange={handleStatusChange}
                    onVideoUploadClick={handleVideoUploadClick}
                    onCandidateUpdate={handleCandidateUpdate}
                    isVideoUploading={videoUploadingCandidate === c.id_ld}
                    currentStatus={c.interview_status}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
