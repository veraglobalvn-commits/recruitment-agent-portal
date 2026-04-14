'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { Candidate, AdminOrder, AgentOption } from '@/lib/types';
import CandidateCard from '@/components/CandidateCard';
import Link from 'next/link';

const STATUS_OPTIONS = ['Đang tuyển', 'Đã tuyển đủ'];
const PAYMENT_OPTIONS = ['Chưa TT', 'TT lan 1', 'TT lan 2', 'TT lan 3', 'Đã TT'];

const MEAL_OPTIONS = [
  '1 bữa chính, 1 bữa tăng ca',
  '2 bữa chính, 1 bữa tăng ca',
  '3 bữa chính',
];

const DORMITORY_OPTIONS = ['Miễn phí', 'Có phí', 'Không hỗ trợ'];

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

function VideoPlayer({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" onClick={onClose}>
      <div className="relative w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute -top-10 right-0 text-white text-2xl min-h-[44px] min-w-[44px] flex items-center justify-center">✕</button>
        <video src={url} controls autoPlay className="w-full rounded-2xl bg-black" style={{ maxHeight: '70vh' }} />
      </div>
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
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);
  const [showAgentDropdown, setShowAgentDropdown] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [generatingDoc, setGeneratingDoc] = useState(false);

  const videoInputRef = useRef<HTMLInputElement>(null);

  const agentMap = new Map(agents.map((a) => [a.id, a]));

  const [form, setForm] = useState({
    job_type: '',
    job_type_en: '',
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
    meal: '1 bữa chính, 1 bữa tăng ca',
    meal_en: '',
    dormitory: 'Miễn phí',
    dormitory_en: '',
    dormitory_note: '',
    probation: 'Không',
    probation_months: '',
    probation_salary_pct: '',
    recruitment_info: '',
    recruitment_info_en: '',
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

  // Auto-calc total_fee_vn = total_labor × service_fee_per_person
  useEffect(() => {
    const labor = parseInt(form.total_labor) || 0;
    const fee = parseFloat(form.service_fee_per_person) || 0;
    if (labor > 0 && fee > 0) {
      const calc = String(labor * fee);
      setForm((f) => (f.total_fee_vn === calc ? f : { ...f, total_fee_vn: calc }));
    }
  }, [form.total_labor, form.service_fee_per_person]);

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
        job_type_en: o.job_type_en ?? '',
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
        meal: o.meal ?? '1 bữa chính, 1 bữa tăng ca',
        meal_en: o.meal_en ?? '',
        dormitory: o.dormitory ?? 'Miễn phí',
        dormitory_en: o.dormitory_en ?? '',
        dormitory_note: o.dormitory_note ?? '',
        probation: o.probation ?? 'Không',
        probation_months: o.probation_months?.toString() ?? '',
        probation_salary_pct: o.probation_salary_pct?.toString() ?? '',
        recruitment_info: o.recruitment_info ?? '',
        recruitment_info_en: o.recruitment_info_en ?? '',
      });
    }
    setCandidates((candRes.data ?? []) as Candidate[]);
    const agentsData = (agRes.data ?? []) as (AgentOption & { labor_percentage: number | null })[];
    setAgents(agentsData);
    const allocations: Record<string, string> = {};
    agentsData.forEach((ag) => {
      const percentage = ag.labor_percentage ?? 0;
      const tl = ordRes.data?.total_labor ?? 0;
      const allocation = percentage > 0 ? Math.round((percentage / 100) * tl) : 0;
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
      job_type_en: form.job_type_en.trim() || null,
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
      meal: form.meal || null,
      meal_en: form.meal_en.trim() || null,
      dormitory: form.dormitory || null,
      dormitory_en: form.dormitory_en.trim() || null,
      dormitory_note: form.dormitory_note.trim() || null,
      probation: form.probation || 'Không',
      probation_months: form.probation === 'Có' && form.probation_months ? parseInt(form.probation_months) : null,
      probation_salary_pct: form.probation === 'Có' && form.probation_salary_pct ? parseInt(form.probation_salary_pct) : null,
      recruitment_info: form.recruitment_info.trim() || null,
      recruitment_info_en: form.recruitment_info_en.trim() || null,
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
      const tl = parseInt(form.total_labor) || 0;
      const percentage = tl > 0 && numValue !== null ? Math.round((numValue / tl) * 100) : null;
      const { error } = await supabase.from('agents').update({ labor_percentage: percentage }).eq('id', agentId);
      if (error) throw error;
    } catch (err) {
      alert(`Lỗi lưu số người: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [form.total_labor]);

  const handleTranslate = useCallback(async () => {
    if (!order?.company_id) { alert('Đơn hàng chưa có công ty'); return; }
    setTranslating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const probationInfo = form.probation === 'Có' && form.probation_months
        ? `${form.probation_months} tháng, ${form.probation_salary_pct || 100}% lương`
        : '';
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          company_id: order.company_id,
          job_type: form.job_type,
          meal: form.meal,
          dormitory: form.dormitory,
          recruitment_info: form.recruitment_info,
          probation_info: probationInfo,
        }),
      });
      if (!res.ok) { alert('Dịch thất bại'); return; }
      const data = await res.json() as {
        job_type_en: string | null;
        meal_en: string | null;
        dormitory_en: string | null;
        recruitment_info_en: string | null;
      };
      setForm((f) => ({
        ...f,
        job_type_en: data.job_type_en ?? f.job_type_en,
        meal_en: data.meal_en ?? f.meal_en,
        dormitory_en: data.dormitory_en ?? f.dormitory_en,
        recruitment_info_en: data.recruitment_info_en ?? f.recruitment_info_en,
      }));
      setDirty(true);
      setSaveMsg('✅ Đã dịch tự động');
      setTimeout(() => setSaveMsg(null), 3000);
    } catch {
      alert('Lỗi dịch thuật');
    } finally {
      setTranslating(false);
    }
  }, [order, form]);

  const handleGenerateDoc = useCallback(async () => {
    const docUrl = process.env.NEXT_PUBLIC_N8N_RECRUITMENT_DOC_URL;
    if (!docUrl) { alert('Chưa cấu hình N8N_RECRUITMENT_DOC_URL'); return; }
    if (!order) return;
    setGeneratingDoc(true);
    try {
      const agentList = agents
        .filter((ag) => form.agent_ids.includes(ag.id))
        .map((ag) => ({
          name: ag.short_name || ag.full_name || ag.id,
          allocated_labor: parseInt(agentLaborAllocations[ag.id] || '0') || 0,
        }));

      const res = await fetch(docUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: order.id,
          company_id: order.company_id,
          company_name: order.company_name,
          job_type: form.job_type,
          job_type_en: form.job_type_en,
          total_labor: parseInt(form.total_labor) || null,
          salary_usd: form.salary_usd ? parseFloat(form.salary_usd) : null,
          meal: form.meal,
          meal_en: form.meal_en,
          dormitory: form.dormitory,
          dormitory_en: form.dormitory_en,
          dormitory_note: form.dormitory_note || null,
          probation: form.probation,
          probation_months: form.probation === 'Có' ? parseInt(form.probation_months) || null : null,
          probation_salary_pct: form.probation === 'Có' ? parseInt(form.probation_salary_pct) || null : null,
          legal_status: form.legal_status,
          recruitment_info: form.recruitment_info,
          recruitment_info_en: form.recruitment_info_en,
          agents: agentList,
        }),
      });
      if (!res.ok) throw new Error(`n8n error: ${res.status}`);
      const data = await res.json() as { url?: string };
      if (!data.url) throw new Error('n8n did not return a URL');
      const { error } = await supabase.from('orders').update({ url_order: data.url }).eq('id', id);
      if (error) throw new Error(error.message);
      setForm((f) => ({ ...f, url_order: data.url! }));
      setSaveMsg('✅ Đã tạo tài liệu');
      setTimeout(() => setSaveMsg(null), 3000);
    } catch (err) {
      alert(`Lỗi tạo tài liệu: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setGeneratingDoc(false);
    }
  }, [order, form, agents, agentLaborAllocations, id]);

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
      {playingVideo && <VideoPlayer url={playingVideo} onClose={() => setPlayingVideo(null)} />}
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

        {/* Progress card */}
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

        {/* Thông tin đơn hàng */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Thông tin đơn hàng</h2>
            <div className="flex items-center gap-2">
              {saving && <span className="text-xs text-blue-500 animate-pulse">Đang lưu...</span>}
              <button
                onClick={handleTranslate}
                disabled={translating}
                className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 rounded-lg min-h-[32px] disabled:opacity-50"
              >
                {translating ? '⏳' : '✨ Dịch EN'}
              </button>
            </div>
          </div>
          <div className="p-4 space-y-3">
            {/* Job type VN + EN */}
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs text-gray-500 mb-1">Vị trí / Loại lao động</label><input type="text" value={form.job_type} onChange={(e) => setField('job_type', e.target.value)} placeholder="Công nhân nhà máy" className={inputCls} /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Job Type (EN)</label><input type="text" value={form.job_type_en} onChange={(e) => setField('job_type_en', e.target.value)} placeholder="Auto / manual" className={inputCls} /></div>
            </div>
            {/* Numbers */}
            <div className="grid grid-cols-3 gap-3">
              <div><label className="block text-xs text-gray-500 mb-1">Số LĐ</label><input type="number" value={form.total_labor} onChange={(e) => setField('total_labor', e.target.value)} placeholder="50" className={inputCls} /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Còn thiếu</label><input type="number" value={form.labor_missing} onChange={(e) => setField('labor_missing', e.target.value)} placeholder="20" className={inputCls} /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Lương (USD)</label><input type="number" value={form.salary_usd} onChange={(e) => setField('salary_usd', e.target.value)} placeholder="650" className={inputCls} /></div>
            </div>
            {/* Status + Legal */}
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs text-gray-500 mb-1">Trạng thái</label><select value={form.status} onChange={(e) => setField('status', e.target.value)} className={`${inputCls} bg-white`}>{STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
              <div><label className="block text-xs text-gray-500 mb-1">Pháp lý</label><input type="text" value={form.legal_status} onChange={(e) => setField('legal_status', e.target.value)} placeholder="VD: Đã phê duyệt" className={inputCls} /></div>
            </div>
            {/* Meal */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Hỗ trợ bữa ăn</label>
                <select value={form.meal} onChange={(e) => setField('meal', e.target.value)} className={`${inputCls} bg-white`}>
                  {MEAL_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div><label className="block text-xs text-gray-500 mb-1">Meal (EN)</label><input type="text" readOnly value={form.meal_en} placeholder="Auto-filled" className={`${inputCls} bg-gray-50`} /></div>
            </div>
            {/* Dormitory */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Hỗ trợ nhà ở</label>
              <div className="flex gap-2">
                <select value={form.dormitory} onChange={(e) => setField('dormitory', e.target.value)} className={`${inputCls} bg-white flex-1`}>
                  {DORMITORY_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                {form.dormitory === 'Không hỗ trợ' && (
                  <input
                    type="text"
                    value={form.dormitory_note}
                    onChange={(e) => setField('dormitory_note', e.target.value)}
                    placeholder="Chi tiết nhà ở..."
                    className={`${inputCls} flex-1`}
                  />
                )}
              </div>
            </div>
            {/* Probation */}
            <div>
              <label className="block text-xs text-gray-500 mb-2">Thử việc</label>
              <div className="flex items-center gap-2 mb-2">
                <button
                  onClick={() => setField('probation', form.probation === 'Có' ? 'Không' : 'Có')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium min-h-[36px] transition-colors ${
                    form.probation === 'Có' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {form.probation === 'Có' ? 'Có thử việc' : 'Không thử việc'}
                </button>
              </div>
              {form.probation === 'Có' && (
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs text-gray-500 mb-1">Số tháng thử việc</label><input type="number" value={form.probation_months} onChange={(e) => setField('probation_months', e.target.value)} placeholder="2" className={inputCls} /></div>
                  <div><label className="block text-xs text-gray-500 mb-1">% lương thử việc</label><input type="number" min="0" max="100" value={form.probation_salary_pct} onChange={(e) => setField('probation_salary_pct', e.target.value)} placeholder="85" className={inputCls} /></div>
                </div>
              )}
            </div>
            {/* Recruitment info */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Thông tin tuyển dụng</label>
              <textarea value={form.recruitment_info} onChange={(e) => setField('recruitment_info', e.target.value)} placeholder="Yêu cầu sức khỏe, kinh nghiệm, v.v." rows={3} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
          </div>
        </div>

        {/* Agent phụ trách */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
            <h2 className={`text-sm font-semibold ${isLaborUnbalanced ? 'text-red-600' : 'text-slate-700'}`}>Agent phụ trách</h2>
            <div className="flex items-center gap-2">
              {form.agent_ids.length > 0 && (
                <button
                  onClick={handleGenerateDoc}
                  disabled={generatingDoc}
                  className="text-xs bg-green-600 hover:bg-green-700 text-white px-2.5 py-1 rounded-lg min-h-[32px] disabled:opacity-50 flex items-center gap-1"
                >
                  {generatingDoc ? '⏳ Đang tạo...' : '📄 Tạo YCTD'}
                </button>
              )}
              <div className="relative">
                <button onClick={() => setShowAgentDropdown(!showAgentDropdown)} className="text-xs text-blue-600 hover:underline">
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
                            setForm((f) => ({ ...f, agent_ids: [...f.agent_ids, ag.id] }));
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
          </div>
          <div className="p-4">
            {isLaborUnbalanced && (
              <div className="mb-3 p-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg text-center">
                ⚠️ Tổng số lao động phân công ({totalAllocatedLabor}) không bằng tổng số cần tuyển ({totalLabor})
              </div>
            )}
            {form.url_order && (
              <div className="mb-3 p-2 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
                <span className="text-xs text-green-700 font-medium">📄 Yêu cầu tuyển dụng đã tạo</span>
                <a href={form.url_order} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">Xem ↗</a>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {agents.filter((ag) => form.agent_ids.includes(ag.id)).map((ag) => {
                const allocation = agentLaborAllocations[ag.id] || '';
                const allocatedLabor = parseInt(allocation) || 0;
                const percentage = totalLabor > 0 ? Math.round((allocatedLabor / totalLabor) * 100) : 0;
                const agPassedCount = candidates.filter((c) => c.agent_id === ag.id && c.interview_status === 'Passed').length;

                return (
                  <div key={ag.id} className="p-2 rounded border border-blue-200 bg-blue-50">
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="checkbox"
                        checked={true}
                        onChange={() => {
                          setForm((f) => ({ ...f, agent_ids: f.agent_ids.filter((x) => x !== ag.id) }));
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
                        <p className="text-sm font-semibold text-green-600">{agPassedCount}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {form.agent_ids.length === 0 && (
              <div className="text-center py-4">
                <p className="text-xs text-gray-400 mb-2">Chưa chọn agent nào</p>
                <button onClick={() => setShowAgentDropdown(!showAgentDropdown)} className="text-xs text-blue-600 hover:underline">+ Thêm agent</button>
              </div>
            )}
            {form.agent_ids.length > 0 && totalLabor > 0 && (
              <div className={`mt-2 text-xs text-center ${isLaborUnbalanced ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                Tổng phân công: {totalAllocatedLabor} / {totalLabor} người
              </div>
            )}
          </div>
        </div>

        {/* Thanh toán */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50">
            <h2 className="text-sm font-semibold text-slate-700">Thanh toán</h2>
          </div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Phí DV / người (VNĐ)</label>
                <input type="number" value={form.service_fee_per_person} onChange={(e) => setField('service_fee_per_person', e.target.value)} placeholder="10000000" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Tổng phí DV (tự tính)</label>
                <input type="number" value={form.total_fee_vn} onChange={(e) => setField('total_fee_vn', e.target.value)} placeholder="500000000" className={inputCls} />
                {form.total_fee_vn && (
                  <p className="text-xs text-gray-400 mt-0.5 text-right">{fmtVnd(parseFloat(form.total_fee_vn))}</p>
                )}
              </div>
            </div>
            {form.total_labor && form.service_fee_per_person && (
              <p className="text-xs text-gray-400 text-center">
                {form.total_labor} LĐ × {fmtVnd(parseFloat(form.service_fee_per_person))} = {fmtVnd(parseFloat(form.total_labor) * parseFloat(form.service_fee_per_person))}
              </p>
            )}
            <div><label className="block text-xs text-gray-500 mb-1">Trạng thái TT</label><select value={form.payment_status_vn} onChange={(e) => setField('payment_status_vn', e.target.value)} className={`${inputCls} bg-white`}>{PAYMENT_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
          </div>
        </div>

        {/* Tài liệu */}
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
              <label className="block text-xs text-gray-500 mb-1">Yêu cầu tuyển dụng (URL)</label>
              <input type="url" value={form.url_order} onChange={(e) => setField('url_order', e.target.value)} placeholder="https://..." className={inputCls} />
              {form.url_order && (
                <a href={form.url_order} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline mt-1 inline-block">📎 Mở YCTD ↗</a>
              )}
            </div>
          </div>
        </div>

        {/* Ứng viên */}
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
                    onVideoPlay={(url) => setPlayingVideo(url)}
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
