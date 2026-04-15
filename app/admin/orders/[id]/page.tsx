'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { Candidate, AdminOrder, AgentOption, OrderHandover, OrderPayment, OrderDocLink } from '@/lib/types';
import CandidateCard from '@/components/CandidateCard';
import Link from 'next/link';


const MEAL_OPTIONS = [
  '1 bữa chính, 1 bữa tăng ca',
  '2 bữa chính, 1 bữa tăng ca',
  '3 bữa chính',
];

const DORMITORY_OPTIONS = ['Miễn phí', 'Có phí', 'Không hỗ trợ'];
const PROBATION_OPTIONS = ['Không', '1 tháng', '2 tháng', '3 tháng', '6 tháng'];
const DEPARTURE_STATUS_OPTIONS: OrderHandover['departure_status'][] = ['Chưa xuất cảnh', 'Đã xuất cảnh', 'Đã bàn giao'];
const PAYMENT_STATUS_OPTIONS: OrderHandover['payment_status'][] = ['Chưa TT', 'Đã TT'];

import { fmtVND, fmtUSD } from '@/lib/formatters';

function StatusPill({ label }: { label: string | null }) {
  if (!label) return <span className="text-gray-400 text-xs">—</span>;
  const c: Record<string, string> = {
    'Not Started': 'bg-gray-100 text-gray-600',
    'On-going': 'bg-amber-100 text-amber-700',
    'Finished': 'bg-green-100 text-green-700',
    'Cancelled': 'bg-red-100 text-red-600',
    'Chưa TT': 'bg-red-100 text-red-600',
    'Đã TT': 'bg-green-100 text-green-700',
  };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c[label] ?? 'bg-gray-100 text-gray-600'}`}>{label}</span>;
}

function RecruitmentPill({ status, laborMissing }: { status: string; laborMissing: number | null }) {
  if (status === 'Cancelled') return <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-600">Đã huỷ</span>;
  if (status === 'Finished' || laborMissing === 0) return <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">Đã tuyển xong</span>;
  if (status === 'Not Started') return <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600">Chưa tuyển</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">Đang tuyển</span>;
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
  const [handovers, setHandovers] = useState<OrderHandover[]>([]);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [videoUploadingCandidate, setVideoUploadingCandidate] = useState<string | null>(null);
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);
  const [showAgentDropdown, setShowAgentDropdown] = useState(false);
  const [showHandoverPicker, setShowHandoverPicker] = useState(false);
  const [pickerSelected, setPickerSelected] = useState<string[]>([]);
  const [expandedHandovers, setExpandedHandovers] = useState<Set<string>>(new Set());
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);
  const [payments, setPayments] = useState<OrderPayment[]>([]);
  const [addingPaymentParty, setAddingPaymentParty] = useState<'company' | 'agent' | null>(null);
  const [newPayment, setNewPayment] = useState<Partial<OrderPayment>>({});
  const [translating, setTranslating] = useState(false);
  const [docLinks, setDocLinks] = useState<OrderDocLink[]>([]);
  const [yctdLoading, setYctdLoading] = useState<Record<string, boolean>>({});
  const [contractType, setContractType] = useState<1 | 2>(1);
  const [contractLoading, setContractLoading] = useState(false);

  const videoInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    job_type: '',
    job_type_en: '',
    total_labor: '',
    labor_missing: '',
    salary_usd: '',
    status: 'Not Started',
    agent_ids: [] as string[],
    total_fee_vn: '',
    service_fee_per_person: '',
    service_fee_bd_per_person: '',
    total_fee_bd: '',
    url_order: '',
    meal: '1 bữa chính, 1 bữa tăng ca',
    meal_en: '',
    dormitory: 'Miễn phí',
    dormitory_en: '',
    dormitory_note: '',
    probation: 'Không',
    probation_salary_pct: '',
    agent_order_status: '',
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

  // Auto-calc fees (VN + BD)
  useEffect(() => {
    const n = parseInt(form.total_labor) || 0;
    const vnd = parseFloat(form.service_fee_per_person) || 0;
    const usd = parseFloat(form.service_fee_bd_per_person) || 0;
    setForm((f) => {
      const newVnd = n > 0 && vnd > 0 ? String(n * vnd) : f.total_fee_vn;
      const newUsd = n > 0 && usd > 0 ? String(n * usd) : f.total_fee_bd;
      if (newVnd === f.total_fee_vn && newUsd === f.total_fee_bd) return f;
      return { ...f, total_fee_vn: newVnd, total_fee_bd: newUsd };
    });
  }, [form.total_labor, form.service_fee_per_person, form.service_fee_bd_per_person]);

  const load = useCallback(async () => {
    setLoading(true);
    const [ordRes, candRes, agRes, handRes, payRes, policyRes] = await Promise.all([
      supabase.from('orders').select('*').eq('id', id).single(),
      supabase.from('candidates').select('*').eq('order_id', id),
      supabase.from('agents').select('id, full_name, short_name, labor_percentage').neq('role', 'admin'),
      supabase.from('order_handovers').select('*').eq('order_id', id).order('batch_no'),
      supabase.from('order_payments').select('*').eq('order_id', id).order('created_at'),
      supabase.from('policy_settings').select('key, value').in('key', ['default_fee_vnd', 'default_fee_usd']),
    ]);
    const policyMap = Object.fromEntries(((policyRes.data ?? []) as { key: string; value: string }[]).map(r => [r.key, r.value]));

    if (ordRes.data) {
      const o = ordRes.data as AdminOrder;
      setOrder(o);
      setDocLinks((o.doc_links as OrderDocLink[]) ?? []);
      setForm({
        job_type: o.job_type ?? '',
        job_type_en: o.job_type_en ?? '',
        total_labor: o.total_labor?.toString() ?? '',
        labor_missing: o.labor_missing?.toString() ?? '',
        salary_usd: o.salary_usd?.toString() ?? '',
        status: o.status ?? 'Not Started',
        agent_ids: o.agent_ids ?? [],
        total_fee_vn: o.total_fee_vn?.toString() ?? '',
        service_fee_per_person: o.service_fee_per_person?.toString() || policyMap.default_fee_vnd || '',
        service_fee_bd_per_person: o.service_fee_bd_per_person?.toString() ?? '',
        total_fee_bd: o.total_fee_bd?.toString() ?? '',
        url_order: o.url_order ?? '',
        meal: o.meal ?? '1 bữa chính, 1 bữa tăng ca',
        meal_en: o.meal_en ?? '',
        dormitory: o.dormitory ?? 'Miễn phí',
        dormitory_en: o.dormitory_en ?? '',
        dormitory_note: o.dormitory_note ?? '',
        probation: o.probation ?? 'Không',
        probation_salary_pct: o.probation_salary_pct?.toString() ?? '',
        agent_order_status: o.agent_order_status ?? '',
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
    setHandovers((handRes.data ?? []) as OrderHandover[]);
    setPayments((payRes.data ?? []) as OrderPayment[]);
    setDirty(false);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleTranslateSilent = useCallback(async () => {
    if (!order?.company_id) return;
    setTranslating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const probationMonths = form.probation !== 'Không' ? parseInt(form.probation) : null;
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          company_id: order.company_id,
          job_type: form.job_type,
          meal: form.meal,
          dormitory: form.dormitory,
          probation: form.probation,
          probation_months: probationMonths,
          probation_salary_pct: form.probation_salary_pct ? parseInt(form.probation_salary_pct) : null,
        }),
      });
      if (!res.ok) {
        console.error('[translate] API error:', res.status, await res.text());
        return;
      }
      const data = await res.json() as {
        job_type_en: string | null;
        meal_en: string | null;
        dormitory_en: string | null;
      };
      const updates: Record<string, string | null> = {};
      if (data.job_type_en) updates.job_type_en = data.job_type_en;
      if (data.meal_en) updates.meal_en = data.meal_en;
      if (data.dormitory_en) updates.dormitory_en = data.dormitory_en;
      if (Object.keys(updates).length === 0) return;
      await supabase.from('orders').update(updates).eq('id', id);
      setForm((f) => ({
        ...f,
        job_type_en: data.job_type_en ?? f.job_type_en,
        meal_en: data.meal_en ?? f.meal_en,
        dormitory_en: data.dormitory_en ?? f.dormitory_en,
      }));
    } catch (err) {
      console.error('[translate] error:', err);
    } finally {
      setTranslating(false);
    }
  }, [order, form, id]);

  const handleSave = useCallback(async () => {
    if (!order) return;
    setSaving(true);
    setSaveMsg(null);

    const probationMonths = form.probation !== 'Không' ? parseInt(form.probation) : null;

    const { error } = await supabase.from('orders').update({
      job_type: form.job_type.trim() || null,
      job_type_en: form.job_type_en.trim() || null,
      total_labor: form.total_labor ? parseInt(form.total_labor) : null,
      labor_missing: (() => { const total = parseInt(form.total_labor) || 0; const passed = (candidates?.filter(c => c.interview_status === 'Passed').length) || 0; return Math.max(0, total - passed); })(),
      salary_usd: form.salary_usd ? parseFloat(form.salary_usd) : null,
      status: (() => {
        if (form.status === 'Cancelled') return 'Cancelled';
        const passedCount = (candidates?.filter(c => c.interview_status === 'Passed').length) ?? 0;
        const totalLabor = parseInt(form.total_labor) || 0;
        const candCount = candidates?.length ?? 0;
        if (totalLabor > 0 && passedCount >= totalLabor) return 'Finished';
        if (candCount > 0) return 'On-going';
        // Không downgrade từ On-going → Not Started (tránh race condition khi agent vừa add LĐ)
        if (form.status === 'On-going') return 'On-going';
        return 'Not Started';
      })(),
      agent_ids: form.agent_ids.length > 0 ? form.agent_ids : null,
      total_fee_vn: form.total_fee_vn ? parseFloat(form.total_fee_vn) : null,
      service_fee_per_person: form.service_fee_per_person ? parseFloat(form.service_fee_per_person) : null,
      url_order: form.url_order.trim() || null,
      meal: form.meal || null,
      meal_en: form.meal_en.trim() || null,
      dormitory: form.dormitory || null,
      dormitory_en: form.dormitory_en.trim() || null,
      dormitory_note: form.dormitory_note.trim() || null,
      probation: form.probation || 'Không',
      probation_months: probationMonths,
      probation_salary_pct: form.probation !== 'Không' && form.probation_salary_pct ? parseInt(form.probation_salary_pct) : null,
      service_fee_bd_per_person: form.service_fee_bd_per_person ? parseFloat(form.service_fee_bd_per_person) : null,
      total_fee_bd: form.total_fee_bd ? parseFloat(form.total_fee_bd) : null,
    }).eq('id', id);

    setSaving(false);
    if (error) { setSaveMsg(`❌ ${error.message}`); return; }
    setSaveMsg('✅ Đã lưu');
    setDirty(false);
    setTimeout(() => setSaveMsg(null), 3000);
    // Auto-translate silently
    handleTranslateSilent();
  }, [id, order, form, handleTranslateSilent]);

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
    }
  }, []);

  const handleAgentAllocationChange = useCallback(async (agentId: string, value: string) => {
    const numValue = value ? parseInt(value, 10) : null;
    setAgentLaborAllocations((prev: Record<string, string>) => ({ ...prev, [agentId]: value }));
    try {
      const tl = parseInt(form.total_labor) || 0;
      const percentage = tl > 0 && numValue !== null ? Math.round((numValue / tl) * 100) : null;
      const { error } = await supabase.from('agents').update({ labor_percentage: percentage }).eq('id', agentId);
      if (error) throw error;
    } catch (err) {
      alert(`Lỗi lưu: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [form.total_labor]);

  // Handover CRUD
  const createHandover = async () => {
    if (pickerSelected.length === 0) return;
    const maxBatch = handovers.reduce((m, h) => Math.max(m, h.batch_no), 0);
    const feePerPerson = parseFloat(form.service_fee_per_person) || 0;
    const feeVnd = pickerSelected.length * feePerPerson || null;
    const { data, error } = await supabase.from('order_handovers').insert({
      order_id: id,
      batch_no: maxBatch + 1,
      candidate_ids: pickerSelected,
      labor_count: pickerSelected.length,
      fee_vnd: feeVnd,
      departure_status: 'Chưa xuất cảnh',
      payment_status: 'Chưa TT',
    }).select().single();
    if (!error && data) {
      setHandovers((h) => [...h, data as OrderHandover]);
    }
    setShowHandoverPicker(false);
    setPickerSelected([]);
  };

  const handleSetStatus = async (newStatus: 'Finished' | 'Cancelled') => {
    await supabase.from('orders').update({ status: newStatus }).eq('id', id);
    setForm((f) => ({ ...f, status: newStatus }));
  };

  const handleCreateYctd = async (agentId: string) => {
    setYctdLoading((p) => ({ ...p, [agentId]: true }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch('/api/orders/yctd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ order_id: id, agent_id: agentId }),
      });
      const json = await res.json() as { pdf_url?: string; edit_url?: string; error?: string; missing?: string[] };
      if (!res.ok) {
        alert(json.missing ? `Thiếu thông tin: ${json.missing.join(', ')}` : (json.error ?? 'Lỗi không xác định'));
        return;
      }
      const agentName = agents.find((a) => a.id === agentId)?.short_name || agentId;
      setDocLinks((prev) => [
        ...prev.filter((d) => !(d.type === 'yctd' && d.agent_id === agentId)),
        { name: `YCTD - ${agentName}`, type: 'yctd', agent_id: agentId, pdf_url: json.pdf_url ?? '', edit_url: json.edit_url, created_at: new Date().toISOString() },
      ]);
    } catch (err) {
      alert(`Lỗi: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setYctdLoading((p) => ({ ...p, [agentId]: false }));
    }
  };

  const handleCreateContract = async () => {
    setContractLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch('/api/orders/contract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ order_id: id, contract_type: contractType }),
      });
      const json = await res.json() as { pdf_url?: string; edit_url?: string; error?: string; missing?: string[] };
      if (!res.ok) {
        alert(json.missing ? `Thiếu thông tin: ${json.missing.join(', ')}` : (json.error ?? 'Lỗi không xác định'));
        return;
      }
      const contractName = contractType === 1 ? 'HĐ Cơ bản' : 'HĐ Nâng cao';
      setDocLinks((prev) => [
        ...prev.filter((d) => !(d.type === 'contract' && d.contract_type === contractType)),
        { name: contractName, type: 'contract', contract_type: contractType, pdf_url: json.pdf_url ?? '', edit_url: json.edit_url, created_at: new Date().toISOString() },
      ]);
    } catch (err) {
      alert(`Lỗi: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setContractLoading(false);
    }
  };

  const updateHandover = async (handoverId: string, updates: Partial<OrderHandover>) => {
    await supabase.from('order_handovers').update(updates).eq('id', handoverId);
    setHandovers((hs) => hs.map((h) => h.id === handoverId ? { ...h, ...updates } : h));
  };

  const deleteHandover = async (handoverId: string) => {
    if (!confirm('Xoá lô bàn giao này?')) return;
    await supabase.from('order_handovers').delete().eq('id', handoverId);
    setHandovers((hs) => hs.filter((h) => h.id !== handoverId));
  };

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
      alert(`Lỗi upload: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (videoInputRef.current) videoInputRef.current.value = '';
      setVideoUploadingCandidate(null);
    }
  };

  // Payment pct — use order_payments table
  const totalPaidVnd = payments.filter(p => p.payment_party === 'company' && p.currency === 'VND').reduce((s, p) => s + Number(p.amount), 0);
  const totalPaidAgent = payments.filter(p => p.payment_party === 'agent').reduce((s, p) => s + Number(p.amount), 0);
  const totalFeeVndNum = parseFloat(form.total_fee_vn) || 0;
  const totalFeeBdNum = parseFloat(form.total_fee_bd) || 0;
  const paymentPct = totalFeeVndNum > 0 ? Math.round((totalPaidVnd / totalFeeVndNum) * 100) : 0;
  const totalHandedOver = handovers.filter(h => h.departure_status !== 'Chưa xuất cảnh').reduce((s, h) => s + h.labor_count, 0);

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

  const addPayment = async () => {
    if (!newPayment.amount || !newPayment.payment_type) return;
    const payload: Partial<OrderPayment> = {
      order_id: id,
      payment_party: addingPaymentParty ?? 'company',
      payment_type: newPayment.payment_type,
      agent_id: newPayment.agent_id ?? null,
      handover_id: newPayment.handover_id ?? null,
      amount: newPayment.amount,
      currency: newPayment.currency ?? 'VND',
      payment_date: newPayment.payment_date ?? null,
      note: newPayment.note ?? null,
    };
    const { data, error } = await supabase.from('order_payments').insert(payload).select().single();
    if (error) { alert(`Lỗi: ${error.message}`); return; }
    setPayments(ps => [...ps, data as OrderPayment]);
    setNewPayment({});
    setAddingPaymentParty(null);
  };

  const deletePayment = async (paymentId: string) => {
    if (!confirm('Xoá giao dịch này?')) return;
    await supabase.from('order_payments').delete().eq('id', paymentId);
    setPayments(ps => ps.filter(p => p.id !== paymentId));
  };

  const passedCount = candidates.filter((c) => c.interview_status === 'Passed').length;
  const inputClsBase = 'w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]';
  const inputCls = (val: any) => `${inputClsBase} ${!val ? 'missing-input' : ''}`;

  // Candidate picker modal: candidates not yet in any handover
  const alreadyInHandover = new Set(handovers.flatMap(h => h.candidate_ids));
  const availableCandidates = candidates.filter(c => !alreadyInHandover.has(c.id_ld));

  return (
    <div className="pb-24">
      {playingVideo && <VideoPlayer url={playingVideo} onClose={() => setPlayingVideo(null)} />}
      <input type="file" accept="video/*" ref={videoInputRef} onChange={handleVideoChange} className="hidden" />

      {/* Candidate picker modal */}
      {showHandoverPicker && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowHandoverPicker(false)}>
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-xl p-5 pb-8 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4 sm:hidden" />
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-slate-800">Chọn lao động cho lô</h3>
              <button onClick={() => setShowHandoverPicker(false)} className="text-gray-400 text-xl min-h-[44px] min-w-[44px] flex items-center justify-center">✕</button>
            </div>
            <p className="text-xs text-gray-500 mb-3">Đã chọn: {pickerSelected.length} người</p>
            <div className="flex-1 overflow-y-auto space-y-1 border border-gray-200 rounded-lg p-2">
              {availableCandidates.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Không còn lao động chưa xếp lô</p>
              ) : (
                availableCandidates.map(c => (
                  <label key={c.id_ld} className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pickerSelected.includes(c.id_ld)}
                      onChange={() => setPickerSelected(p => p.includes(c.id_ld) ? p.filter(x => x !== c.id_ld) : [...p, c.id_ld])}
                      className="rounded text-blue-600"
                    />
                    <div>
                      <p className="text-sm font-medium text-slate-800">{c.full_name || '—'}</p>
                      <p className="text-xs text-gray-400">PP: {c.pp_no || '—'}</p>
                    </div>
                  </label>
                ))
              )}
            </div>
            <button
              onClick={createHandover}
              disabled={pickerSelected.length === 0}
              className="mt-4 w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm min-h-[44px]"
            >
              Tạo lô ({pickerSelected.length} người)
            </button>
          </div>
        </div>
      )}

      <div className="sticky top-0 z-20 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.back()} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-500 hover:text-gray-800 text-xl">←</button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate text-slate-800">{order.id}</p>
          {order.company_name && <p className="text-xs text-gray-400 truncate">{order.company_name}</p>}
        </div>
        <RecruitmentPill status={form.status} laborMissing={(() => { const total = parseInt(form.total_labor) || 0; const passed = (candidates?.filter(c => c.interview_status === 'Passed').length) || 0; return Math.max(0, total - passed); })()} />
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
                <span className="font-semibold text-slate-700">{passedCount}/{totalLabor} · còn thiếu {Math.max(0, totalLabor - passedCount)}</span>
              </div>
              <ProgressBar value={passedCount} max={totalLabor} />
            </div>
          )}
          {totalHandedOver > 0 && (
            <p className="text-xs text-gray-500">Đã bàn giao: <span className="font-semibold text-slate-700">{totalHandedOver}</span> lao động</p>
          )}
          {/* Payment summary */}
          <div className="mt-2 pt-2 border-t border-gray-50 grid grid-cols-2 gap-x-3 text-xs text-gray-500">
            <div>
              <span>Cty VN: </span>
              <span className="font-semibold text-green-600">{fmtVND(totalPaidVnd)}</span>
              {totalFeeVndNum > 0 && <span className="text-gray-400"> / {fmtVND(totalFeeVndNum)}</span>}
            </div>
            <div>
              <span>Agent: </span>
              <span className="font-semibold text-blue-600">{fmtVND(totalPaidAgent)}</span>
              {totalFeeBdNum > 0 && <span className="text-gray-400"> / ${fmtUSD(totalFeeBdNum)}</span>}
            </div>
          </div>
        </div>

        {/* Thông tin đơn hàng */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Thông tin đơn hàng</h2>
            {saving && <span className="text-xs text-blue-500 animate-pulse">Đang lưu...</span>}
          </div>
          <div className="p-4 space-y-3">
            {/* Job type VN */}
            <div><label className="block text-xs text-gray-500 mb-1">Vị trí / Loại lao động</label><input type="text" value={form.job_type} onChange={(e) => setField('job_type', e.target.value)} className={inputCls(form.job_type)} /></div>
            {/* Numbers */}
            <div className="grid grid-cols-3 gap-3">
              <div><label className="block text-xs text-gray-500 mb-1">Số LĐ</label><input type="number" value={form.total_labor} onChange={(e) => setField('total_labor', e.target.value)} className={inputCls(form.total_labor)} /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Còn thiếu</label><p className={inputCls(form.total_labor) + ' bg-gray-100'}>{(() => { const total = parseInt(form.total_labor) || 0; const passed = (candidates?.filter(c => c.interview_status === 'Passed').length) || 0; const remaining = Math.max(0, total - passed); return remaining; })()}</p></div>
              <div><label className="block text-xs text-gray-500 mb-1">Lương (USD)</label><input type="text" value={form.salary_usd ? fmtUSD(parseFloat(form.salary_usd)) : ''} onChange={(e) => setField('salary_usd', e.target.value.replace(/,/g, ''))} className={inputCls(form.salary_usd)} /></div>
            </div>
            {/* Recruitment status (read-only) */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Trạng thái tuyển dụng</label>
              <RecruitmentPill status={form.status} laborMissing={(() => { const total = parseInt(form.total_labor) || 0; const passed = (candidates?.filter(c => c.interview_status === 'Passed').length) || 0; return Math.max(0, total - passed); })()} />
            </div>
            {/* Meal */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Hỗ trợ bữa ăn</label>
              <select value={form.meal} onChange={(e) => setField('meal', e.target.value)} className={`${inputCls(form.meal)} bg-white`}>
                {MEAL_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            {/* Dormitory */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Hỗ trợ nhà ở</label>
              <div className="flex gap-2">
                <select value={form.dormitory} onChange={(e) => setField('dormitory', e.target.value)} className={`${inputCls(form.dormitory)} bg-white flex-1`}>
                  {DORMITORY_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                {form.dormitory === 'Có phí' && (
                  <input type="text" value={form.dormitory_note} onChange={(e) => setField('dormitory_note', e.target.value)} className={`${inputCls(form.dormitory_note)} flex-1`} />
                )}
              </div>
            </div>
            {/* Probation dropdown */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Thử việc</label>
              <div className="flex gap-2">
                <select value={form.probation} onChange={(e) => setField('probation', e.target.value)} className={`${inputCls(form.probation)} bg-white flex-1`}>
                  {PROBATION_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                {form.probation !== 'Không' && (
                  <div className="flex items-center gap-1 flex-1">
                    <input type="number" min="0" max="100" value={form.probation_salary_pct} onChange={(e) => setField('probation_salary_pct', e.target.value)} className={`${inputCls(form.probation_salary_pct)} flex-1`} />
                    <span className="text-xs text-gray-500 flex-shrink-0">% lương</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Agent phụ trách */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
            <h2 className={`text-sm font-semibold ${isLaborUnbalanced ? 'text-red-600' : 'text-slate-700'}`}>Agent phụ trách</h2>
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
                      <button key={ag.id} onClick={() => { setForm((f) => ({ ...f, agent_ids: [...f.agent_ids, ag.id] })); setDirty(true); setShowAgentDropdown(false); }}
                        className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg">
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
                ⚠️ Tổng phân công ({totalAllocatedLabor}) không khớp tổng cần tuyển ({totalLabor})
              </div>
            )}
            {form.url_order && (
              <div className="mb-3 p-2 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
                <span className="text-xs text-green-700 font-medium">📄 Yêu cầu tuyển dụng</span>
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
                      <input type="checkbox" checked={true} onChange={() => { setForm((f) => ({ ...f, agent_ids: f.agent_ids.filter((x) => x !== ag.id) })); setDirty(true); }} className="rounded text-blue-600" />
                      <span className="text-sm text-gray-700 font-medium flex-1">{ag.short_name || ag.full_name}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Số người</label>
                        <input type="number" min="0" value={allocation} onChange={(e) => handleAgentAllocationChange(ag.id, e.target.value)}
                          className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-400" />
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
                <p className="text-xs text-gray-400 mb-2">Chưa có agent phụ trách</p>
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

        {/* Yêu cầu tuyển dụng (YCTD) */}
        {form.agent_ids.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50">
              <h2 className="text-sm font-semibold text-slate-700">Yêu cầu tuyển dụng</h2>
            </div>
            <div className="p-4 space-y-2">
              {agents.filter((ag) => form.agent_ids.includes(ag.id)).map((ag) => {
                const yctdLink = docLinks.find((d) => d.type === 'yctd' && d.agent_id === ag.id);
                const isLoading = !!yctdLoading[ag.id];
                return (
                  <div key={ag.id} className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg">
                    <span className="text-sm text-slate-700 flex-1 min-w-0 truncate">{ag.short_name || ag.full_name}</span>
                    {yctdLink ? (
                      <div className="flex items-center gap-2 text-xs flex-shrink-0">
                        <a href={yctdLink.pdf_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">📄 PDF</a>
                        {yctdLink.edit_url && <a href={yctdLink.edit_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">✏️ Docs</a>}
                        <button onClick={() => handleCreateYctd(ag.id)} disabled={isLoading} className="text-gray-400 hover:text-blue-600 disabled:opacity-50 min-h-[28px] min-w-[28px] flex items-center justify-center">↻</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleCreateYctd(ag.id)}
                        disabled={isLoading}
                        className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 min-h-[32px] flex items-center gap-1 transition-colors flex-shrink-0"
                      >
                        {isLoading ? '⏳ Đang tạo...' : '📋 Tạo YCTD'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Phí dịch vụ Việt Nam */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50">
            <h2 className="text-sm font-semibold text-slate-700">Phí dịch vụ Việt Nam</h2>
          </div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Phí DV / người (VNĐ)</label>
                <input type="text" value={form.service_fee_per_person ? fmtVND(parseFloat(form.service_fee_per_person)) : ''} onChange={(e) => setField('service_fee_per_person', e.target.value.replace(/\./g, '').replace(/,/g, ''))} className={inputCls(form.service_fee_per_person)} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Tổng phí DV VN (VNĐ)</label>
                <input type="text" value={form.total_fee_vn ? fmtVND(parseFloat(form.total_fee_vn)) : ''} onChange={(e) => setField('total_fee_vn', e.target.value.replace(/\./g, '').replace(/,/g, ''))} className={inputCls(form.total_fee_vn)} />
                {form.total_fee_vn && <p className="text-xs text-gray-400 mt-0.5 text-right">{fmtVND(parseFloat(form.total_fee_vn))}</p>}
              </div>
            </div>
            {form.total_labor && form.service_fee_per_person && (
              <p className="text-xs text-gray-400 text-center">
                {form.total_labor} LĐ × {fmtVND(parseFloat(form.service_fee_per_person))} = {fmtVND(parseFloat(form.total_labor) * parseFloat(form.service_fee_per_person))}
              </p>
            )}
            {/* Payment progress bar */}
            <div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden mt-2">
                <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${Math.min(paymentPct, 100)}%` }} />
              </div>
              <p className="text-xs text-gray-500 mt-1">Đã thanh toán {paymentPct}% · {fmtVND(totalPaidVnd)} / {fmtVND(totalFeeVndNum)} ₫</p>
            </div>
          </div>
        </div>

        {/* Phí dịch vụ Bangladesh */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50">
            <h2 className="text-sm font-semibold text-slate-700">Phí dịch vụ Bangladesh</h2>
          </div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Phí DV / Người (USD)</label>
                <input type="text" value={form.service_fee_bd_per_person ? fmtUSD(parseFloat(form.service_fee_bd_per_person)) : ''} onChange={(e) => setField('service_fee_bd_per_person', e.target.value.replace(/\./g, '').replace(/,/g, ''))} className={inputCls(form.service_fee_bd_per_person)} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Tổng phí DV Bangladesh (USD)</label>
                <input type="text" value={form.total_fee_bd ? fmtUSD(parseFloat(form.total_fee_bd)) : ''} onChange={(e) => setField('total_fee_bd', e.target.value.replace(/,/g, ''))} className={inputCls(form.total_fee_bd)} />
              </div>
            </div>
            {form.total_labor && form.service_fee_bd_per_person && (
              <p className="text-xs text-gray-400 text-center">
                {form.total_labor} LĐ × ${form.service_fee_bd_per_person} = ${(parseFloat(form.total_labor) * parseFloat(form.service_fee_bd_per_person)).toLocaleString()}
              </p>
            )}
          </div>
        </div>

        {/* Thông tin tiếng Anh */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Thông tin tiếng Anh</h2>
            <button
              onClick={handleTranslateSilent}
              disabled={translating}
              className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 min-h-[32px] flex items-center gap-1 transition-colors"
            >
              {translating ? '⏳ Đang dịch...' : '🌐 Dịch'}
            </button>
          </div>
          <div className="p-4 space-y-3">
            <div><label className="block text-xs text-gray-500 mb-1">Job Type (EN)</label><input type="text" value={form.job_type_en} onChange={(e) => setField('job_type_en', e.target.value)} className={inputClsBase} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs text-gray-500 mb-1">Meal (EN)</label><input type="text" value={form.meal_en} onChange={(e) => setField('meal_en', e.target.value)} className={inputClsBase} /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Dormitory (EN)</label><input type="text" value={form.dormitory_en} onChange={(e) => setField('dormitory_en', e.target.value)} className={inputClsBase} /></div>
            </div>
          </div>
        </div>

        {/* Công nợ */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50">
            <h2 className="text-sm font-semibold text-slate-700">Công nợ</h2>
          </div>
          <div className="p-4 space-y-4">

            {/* A. Thanh toán của Công ty VN */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-600">Thanh toán của Công ty VN</p>
                <button
                  onClick={() => { setAddingPaymentParty('company'); setNewPayment({ payment_party: 'company', currency: 'VND', payment_type: 'dat_coc' }); }}
                  className="text-xs text-blue-600 hover:underline"
                >+ Thêm</button>
              </div>
              {payments.filter(p => p.payment_party === 'company').length === 0 && addingPaymentParty !== 'company' ? (
                <p className="text-xs text-gray-400 italic">Chưa có giao dịch nào</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs min-w-[500px]">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="py-1.5 pr-3 text-left text-gray-500 font-medium">Loại</th>
                        <th className="py-1.5 pr-3 text-left text-gray-500 font-medium">Lô LĐ</th>
                        <th className="py-1.5 pr-3 text-left text-gray-500 font-medium">Số tiền (VNĐ)</th>
                        <th className="py-1.5 pr-3 text-left text-gray-500 font-medium">Ngày TT</th>
                        <th className="py-1.5 pr-3 text-left text-gray-500 font-medium">Nội dung</th>
                        <th className="py-1.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.filter(p => p.payment_party === 'company').map(p => (
                        <tr key={p.id} className="border-b border-gray-50">
                          <td className="py-1.5 pr-3">
                            {p.payment_type === 'dat_coc' ? 'Đặt cọc'
                              : p.payment_type === 'nghiem_thu_ld' ? 'Nghiệm thu LĐ'
                              : p.payment_type === 'nghiem_thu_trc_wp' ? 'Nghiệm thu TRC/WP'
                              : 'Khác'}
                          </td>
                          <td className="py-1.5 pr-3 text-gray-500">
                            {p.handover_id ? (handovers.find(h => h.id === p.handover_id)?.batch_no ?? '—') : '—'}
                          </td>
                          <td className="py-1.5 pr-3 font-semibold text-slate-700">{fmtVND(p.amount)}</td>
                          <td className="py-1.5 pr-3 text-gray-500">{p.payment_date ?? '—'}</td>
                          <td className="py-1.5 pr-3 text-gray-500 max-w-[150px] truncate">{p.note || '—'}</td>
                          <td className="py-1.5">
                            <button onClick={() => deletePayment(p.id)} className="text-gray-300 hover:text-red-500 min-w-[24px] min-h-[24px] flex items-center justify-center">🗑</button>
                          </td>
                        </tr>
                      ))}
                      {addingPaymentParty === 'company' && (
                        <tr className="border-b border-blue-100 bg-blue-50/30">
                          <td className="py-1.5 pr-3">
                            <select
                              value={newPayment.payment_type ?? 'dat_coc'}
                              onChange={e => setNewPayment(p => ({ ...p, payment_type: e.target.value }))}
                              className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 w-full"
                            >
                              <option value="dat_coc">Đặt cọc</option>
                              <option value="nghiem_thu_ld">Nghiệm thu LĐ</option>
                              <option value="nghiem_thu_trc_wp">Nghiệm thu TRC/WP</option>
                              <option value="khac">Khác</option>
                            </select>
                          </td>
                          <td className="py-1.5 pr-3">
                            {newPayment.payment_type === 'nghiem_thu_ld' ? (
                              <select
                                value={newPayment.handover_id ?? ''}
                                onChange={e => setNewPayment(p => ({ ...p, handover_id: e.target.value || null }))}
                                className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 w-full"
                              >
                                <option value="">— Chọn lô —</option>
                                {handovers.map(h => <option key={h.id} value={h.id}>Lô {h.batch_no}</option>)}
                              </select>
                            ) : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="py-1.5 pr-3">
                            <input
                              type="text"
                              inputMode="numeric"
                              placeholder="0"
                              value={newPayment.amount ? fmtVND(newPayment.amount) : ''}
                              onChange={e => setNewPayment(p => ({ ...p, amount: parseFloat(e.target.value.replace(/\./g, '')) || 0 }))}
                              className="text-xs border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 w-28"
                            />
                          </td>
                          <td className="py-1.5 pr-3">
                            <input
                              type="date"
                              value={newPayment.payment_date ?? ''}
                              onChange={e => setNewPayment(p => ({ ...p, payment_date: e.target.value || null }))}
                              className="text-xs border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                            />
                          </td>
                          <td className="py-1.5 pr-3" colSpan={2}>
                            <input
                              type="text"
                              placeholder={newPayment.payment_type === 'khac' ? 'Nội dung (bắt buộc)' : 'Nội dung (tuỳ chọn)'}
                              value={newPayment.note ?? ''}
                              onChange={e => setNewPayment(p => ({ ...p, note: e.target.value }))}
                              className="text-xs border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 w-full"
                            />
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
              {addingPaymentParty === 'company' && (
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={addPayment}
                    disabled={!newPayment.amount || !newPayment.payment_type || (newPayment.payment_type === 'khac' && !newPayment.note)}
                    className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 min-h-[32px]"
                  >
                    Lưu
                  </button>
                  <button onClick={() => { setAddingPaymentParty(null); setNewPayment({}); }} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5 min-h-[32px]">Huỷ</button>
                </div>
              )}
              {payments.filter(p => p.payment_party === 'company' && p.currency === 'VND').length > 0 && (
                <p className="text-xs font-semibold text-slate-700 mt-2 text-right">
                  Tổng đã thu: {fmtVND(payments.filter(p => p.payment_party === 'company' && p.currency === 'VND').reduce((s, p) => s + p.amount, 0))} ₫
                </p>
              )}
            </div>

            {/* B. Thanh toán Agent */}
            {form.agent_ids.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-600">Thanh toán Agent</p>
                  <button
                    onClick={() => { setAddingPaymentParty('agent'); setNewPayment({ payment_party: 'agent', currency: 'VND', payment_type: 'dat_coc', agent_id: form.agent_ids[0] }); }}
                    className="text-xs text-blue-600 hover:underline"
                  >+ Thêm</button>
                </div>
                {payments.filter(p => p.payment_party === 'agent').length === 0 && addingPaymentParty !== 'agent' ? (
                  <p className="text-xs text-gray-400 italic">Chưa có giao dịch nào</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs min-w-[500px]">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="py-1.5 pr-3 text-left text-gray-500 font-medium">Agent</th>
                          <th className="py-1.5 pr-3 text-left text-gray-500 font-medium">Loại</th>
                          <th className="py-1.5 pr-3 text-left text-gray-500 font-medium">Số tiền (VNĐ)</th>
                          <th className="py-1.5 pr-3 text-left text-gray-500 font-medium">Ngày</th>
                          <th className="py-1.5 pr-3 text-left text-gray-500 font-medium">Nội dung</th>
                          <th className="py-1.5"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {payments.filter(p => p.payment_party === 'agent').map(p => {
                          const agentName = agents.find(a => a.id === p.agent_id);
                          return (
                            <tr key={p.id} className="border-b border-gray-50">
                              <td className="py-1.5 pr-3">{agentName?.short_name || agentName?.full_name || p.agent_id || '—'}</td>
                              <td className="py-1.5 pr-3">{p.payment_type === 'dat_coc' ? 'Đặt cọc' : 'Tất toán phí'}</td>
                              <td className="py-1.5 pr-3 font-semibold text-slate-700">{fmtVND(p.amount)}</td>
                              <td className="py-1.5 pr-3 text-gray-500">{p.payment_date ?? '—'}</td>
                              <td className="py-1.5 pr-3 text-gray-500 max-w-[150px] truncate">{p.note || '—'}</td>
                              <td className="py-1.5">
                                <button onClick={() => deletePayment(p.id)} className="text-gray-300 hover:text-red-500 min-w-[24px] min-h-[24px] flex items-center justify-center">🗑</button>
                              </td>
                            </tr>
                          );
                        })}
                        {addingPaymentParty === 'agent' && (
                          <tr className="border-b border-blue-100 bg-blue-50/30">
                            <td className="py-1.5 pr-3">
                              <select
                                value={newPayment.agent_id ?? ''}
                                onChange={e => setNewPayment(p => ({ ...p, agent_id: e.target.value || null }))}
                                className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 w-full"
                              >
                                {agents.filter(a => form.agent_ids.includes(a.id)).map(a => (
                                  <option key={a.id} value={a.id}>{a.short_name || a.full_name}</option>
                                ))}
                              </select>
                            </td>
                            <td className="py-1.5 pr-3">
                              <select
                                value={newPayment.payment_type ?? 'dat_coc'}
                                onChange={e => setNewPayment(p => ({ ...p, payment_type: e.target.value }))}
                                className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 w-full"
                              >
                                <option value="dat_coc">Đặt cọc</option>
                                <option value="tat_toan_phi">Tất toán phí</option>
                              </select>
                            </td>
                            <td className="py-1.5 pr-3">
                              <input
                                type="text"
                                inputMode="numeric"
                                placeholder="0"
                                value={newPayment.amount ? fmtVND(newPayment.amount) : ''}
                                onChange={e => setNewPayment(p => ({ ...p, amount: parseFloat(e.target.value.replace(/\./g, '')) || 0 }))}
                                className="text-xs border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 w-28"
                              />
                            </td>
                            <td className="py-1.5 pr-3">
                              <input
                                type="date"
                                value={newPayment.payment_date ?? ''}
                                onChange={e => setNewPayment(p => ({ ...p, payment_date: e.target.value || null }))}
                                className="text-xs border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                              />
                            </td>
                            <td className="py-1.5 pr-3" colSpan={2}>
                              <input
                                type="text"
                                placeholder="Nội dung (tuỳ chọn)"
                                value={newPayment.note ?? ''}
                                onChange={e => setNewPayment(p => ({ ...p, note: e.target.value }))}
                                className="text-xs border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 w-full"
                              />
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
                {addingPaymentParty === 'agent' && (
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={addPayment}
                      disabled={!newPayment.amount || !newPayment.payment_type || !newPayment.agent_id}
                      className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 min-h-[32px]"
                    >
                      Lưu
                    </button>
                    <button onClick={() => { setAddingPaymentParty(null); setNewPayment({}); }} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5 min-h-[32px]">Huỷ</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Lô bàn giao / Xuất cảnh */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Lô bàn giao / Xuất cảnh ({handovers.length})</h2>
            <button
              onClick={() => { setPickerSelected([]); setShowHandoverPicker(true); }}
              className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 min-h-[36px]"
            >
              + Tạo lô
            </button>
          </div>
          {handovers.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-6">Chưa có lô bàn giao nào</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="px-3 py-2 text-left text-gray-500 font-medium">Lô</th>
                    <th className="px-3 py-2 text-left text-gray-500 font-medium">Số LĐ</th>
                    <th className="px-3 py-2 text-left text-gray-500 font-medium">Danh sách LĐ</th>
                    <th className="px-3 py-2 text-left text-gray-500 font-medium">Phí VNĐ</th>
                    <th className="px-3 py-2 text-left text-gray-500 font-medium">Trạng thái XC</th>
                    <th className="px-3 py-2 text-left text-gray-500 font-medium">Thanh toán</th>
                    <th className="px-3 py-2 text-left text-gray-500 font-medium">Ngày TT</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {handovers.map(h => {
                    const isExpanded = expandedHandovers.has(h.id);
                    const batchCandidates = h.candidate_ids
                      .map(cid => candidates.find(c => c.id_ld === cid))
                      .filter((c): c is Candidate => c !== undefined);
                    return (
                      <>
                        <tr key={h.id} className="border-b border-gray-50">
                          <td className="px-3 py-2 font-semibold text-slate-700">{h.batch_no}</td>
                          <td className="px-3 py-2">{h.labor_count}</td>
                          <td className="px-3 py-2">
                            <button
                              onClick={() => setExpandedHandovers(prev => {
                                const next = new Set(prev);
                                next.has(h.id) ? next.delete(h.id) : next.add(h.id);
                                return next;
                              })}
                              className="text-xs text-blue-600 hover:underline whitespace-nowrap"
                            >
                              {isExpanded ? 'Ẩn' : `Xem (${h.candidate_ids.length})`}
                            </button>
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" defaultValue={h.fee_vnd ?? ''} onBlur={(e) => updateHandover(h.id, { fee_vnd: e.target.value ? parseFloat(e.target.value) : null })}
                              className="w-28 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                          </td>
                          <td className="px-3 py-2">
                            <select value={h.departure_status} onChange={(e) => updateHandover(h.id, { departure_status: e.target.value as OrderHandover['departure_status'] })}
                              className="text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400">
                              {DEPARTURE_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <select value={h.payment_status} onChange={(e) => updateHandover(h.id, { payment_status: e.target.value as OrderHandover['payment_status'] })}
                              className="text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400">
                              {PAYMENT_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <input type="date" defaultValue={h.payment_date ?? ''} onBlur={(e) => updateHandover(h.id, { payment_date: e.target.value || null })}
                              className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                          </td>
                          <td className="px-3 py-2">
                            <button onClick={() => deleteHandover(h.id)} className="text-gray-300 hover:text-red-500 min-w-[28px] min-h-[28px] flex items-center justify-center">🗑</button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${h.id}-expanded`} className="bg-blue-50/40">
                            <td colSpan={8} className="px-4 py-2">
                              <div className="space-y-1">
                                {batchCandidates.length === 0 ? (
                                  <p className="text-xs text-gray-400 italic">Không tìm thấy thông tin ứng viên</p>
                                ) : (
                                  batchCandidates.map((c, i) => (
                                    <div key={c.id_ld} className="flex items-center gap-3 text-xs">
                                      <span className="text-gray-400 w-4">{i + 1}.</span>
                                      <span className="font-medium text-slate-700">{c.full_name || '—'}</span>
                                      <span className="text-gray-400">PP: {c.pp_no || '—'}</span>
                                      {c.interview_status && (
                                        <span className={`px-1.5 py-0.5 rounded-full ${c.interview_status === 'Passed' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                                          {c.interview_status}
                                        </span>
                                      )}
                                    </div>
                                  ))
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
              <div className="px-4 py-2 bg-gray-50 flex items-center justify-between">
                <span className="text-xs text-gray-500">Tổng đã TT: {fmtVND(totalPaidVnd)}</span>
                <span className={`text-xs font-semibold ${paymentPct >= 100 ? 'text-green-600' : 'text-blue-600'}`}>
                  {paymentPct}% / {fmtVND(totalFeeVndNum)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Ứng viên */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-slate-700">Ứng viên ({candidates.length})</h2>
              <div className="flex items-center gap-2">
                <span className="text-xs text-green-600 font-medium">{passedCount} trúng tuyển</span>
                <span className="text-xs text-gray-400">/ {candidates.length}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1 text-xs cursor-pointer">
                <input type="radio" name="contractType" value="1" checked={contractType === 1} onChange={() => setContractType(1)} className="text-blue-600" />
                <span className="text-gray-600">HĐ Cơ bản</span>
              </label>
              <label className="flex items-center gap-1 text-xs cursor-pointer">
                <input type="radio" name="contractType" value="2" checked={contractType === 2} onChange={() => setContractType(2)} className="text-blue-600" />
                <span className="text-gray-600">HĐ Nâng cao</span>
              </label>
              <button
                onClick={handleCreateContract}
                disabled={contractLoading}
                className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 min-h-[32px] flex items-center gap-1 transition-colors"
              >
                {contractLoading ? '⏳ Đang tạo...' : '📄 Tạo hợp đồng'}
              </button>
              <div className="flex-1" />
              <button
                onClick={() => handleSetStatus('Finished')}
                disabled={form.status === 'Finished' || form.status === 'Cancelled'}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-h-[32px]"
              >✓ Hoàn thành</button>
              <button
                onClick={() => handleSetStatus('Cancelled')}
                disabled={form.status === 'Cancelled'}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-h-[32px]"
              >✕ Huỷ đơn</button>
            </div>
            {docLinks.filter((d) => d.type === 'contract').map((d) => (
              <div key={`${d.type}-${d.contract_type}`} className="mt-2 flex items-center gap-2 text-xs bg-indigo-50 rounded-lg px-3 py-1.5">
                <span className="text-gray-600 font-medium">{d.name}:</span>
                <a href={d.pdf_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">📄 PDF</a>
                {d.edit_url && <a href={d.edit_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">✏️ Chỉnh sửa</a>}
              </div>
            ))}
          </div>
          {selectedCandidates.length > 0 && (
            <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
              <span className="text-xs text-blue-700 font-medium">Đã chọn {selectedCandidates.length} ứng viên</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedCandidates([])}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Bỏ chọn
                </button>
                <button
                  onClick={() => { setPickerSelected(selectedCandidates); setShowHandoverPicker(true); }}
                  className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 min-h-[32px]"
                >
                  + Thêm vào lô bàn giao
                </button>
              </div>
            </div>
          )}
          <div className="p-4">
            {candidates.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-8">Chưa có ứng viên</p>
            ) : (
              <div className="space-y-3">
                {candidates.map((c) => (
                  <div key={c.id_ld} className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={selectedCandidates.includes(c.id_ld)}
                      onChange={() => setSelectedCandidates(prev =>
                        prev.includes(c.id_ld) ? prev.filter(x => x !== c.id_ld) : [...prev, c.id_ld]
                      )}
                      className="mt-4 rounded text-blue-600 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <CandidateCard
                        candidate={c}
                        orderId={id}
                        onStatusChange={handleStatusChange}
                        onVideoUploadClick={handleVideoUploadClick}
                        onCandidateUpdate={handleCandidateUpdate}
                        isVideoUploading={videoUploadingCandidate === c.id_ld}
                        currentStatus={c.interview_status}
                        onVideoPlay={(url) => setPlayingVideo(url)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
