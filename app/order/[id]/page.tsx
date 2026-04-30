'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { Candidate, Order } from '@/lib/types';
import CandidateCard from '@/components/agent/CandidateCard';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import MediaViewer from '@/components/ui/MediaViewer';

interface CompanyVideos {
  factory_video_url: string | null;
  job_video_url: string | null;
  company_media: string[];
  en_industry: string | null;
  industry: string | null;
}

function getAgentOrderStatus(order: Order, candidateCount: number): { label: string; cls: string } {
  if (order.agent_order_status === 'Finished') return { label: 'Finished', cls: 'bg-green-100 text-green-700' };
  if (order.agent_order_status === 'Cancelled') return { label: 'Cancelled', cls: 'bg-red-100 text-red-700' };
  if (candidateCount === 0) return { label: 'Not started', cls: 'bg-gray-100 text-gray-600' };
  return { label: 'On-going', cls: 'bg-blue-100 text-blue-700' };
}

export default function OrderDetail() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const orderId = decodeURIComponent(params.id as string);
  const demandLetterUrl = searchParams.get('dl')
    ? decodeURIComponent(searchParams.get('dl')!)
    : null;
  const focusCandidateId = searchParams.get('candidate')
    ? decodeURIComponent(searchParams.get('candidate')!)
    : null;

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [memberNameMap, setMemberNameMap] = useState<Record<string, string>>({});
  const [orderData, setOrderData] = useState<Order | null>(null);
  const [companyVideos, setCompanyVideos] = useState<CompanyVideos | null>(null);
  const [currentAgentId, setCurrentAgentId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [allocatedLabor, setAllocatedLabor] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaScrollRef = useRef<HTMLDivElement>(null);
  const [videoUploadingCandidate, setVideoUploadingCandidate] = useState<string | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [candidateVideoUrl, setCandidateVideoUrl] = useState<string | null>(null);
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [dupWarning, setDupWarning] = useState<{
    fullName: string; orderId: string; ppNo: string;
    visaStatus: string | null; interviewStatus: string | null;
  } | null>(null);
  const [pendingUpload, setPendingUpload] = useState<{ base64: string; agentId: string | null } | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({
    full_name: '', pp_no: '', dob: '', pp_doi: '', pp_doe: '',
    pob: '', address: '', phone: '', height_ft: '', weight_kg: '',
  });
  const [addSaving, setAddSaving] = useState(false);
  const [fabMenuOpen, setFabMenuOpen] = useState(false);
  const fabRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (fabRef.current && !fabRef.current.contains(e.target as Node)) setFabMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchCandidates = useCallback(async () => {
    try {
      const agentId = localStorage.getItem('agent_id');
      const role = localStorage.getItem('user_role');
      setCurrentAgentId(agentId);
      setCurrentUserRole(role);

      const cacheKey = `c_url_${orderId}`;
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        try {
          setCandidates(JSON.parse(cached));
          setLoading(false);
        } catch (e) { /* ignore */ }
      }

      const [candRes, orderRes] = await Promise.all([
        supabase.from('candidates').select('*').eq('order_id', orderId),
        supabase.from('orders').select('*').eq('id', orderId).single(),
      ]);

      if (candRes.error) throw candRes.error;

      let agentIds: string[] = [];
      let companyId: string | null = null;
      if (orderRes.data) {
        companyId = orderRes.data.company_id ?? null;
        setOrderData({
          order_id: orderRes.data.id,
          company: orderRes.data.company_name,
          company_id: companyId,
          en_company_name: orderRes.data.en_company_name,
          total_labor: orderRes.data.total_labor,
          missing: orderRes.data.labor_missing,
          status: orderRes.data.status || 'N/A',
          url_demand_letter: orderRes.data.url_demand_letter,
          job_type: orderRes.data.job_type,
          job_type_en: orderRes.data.job_type_en,
          salary_usd: orderRes.data.salary_usd,
          url_order: orderRes.data.url_order,
          meal: orderRes.data.meal || orderRes.data.meal_en,
          meal_en: orderRes.data.meal_en || orderRes.data.meal,
          dormitory: orderRes.data.dormitory || orderRes.data.dormitory_en,
          dormitory_en: orderRes.data.dormitory_en || orderRes.data.dormitory,
          recruitment_info: orderRes.data.recruitment_info,
          recruitment_info_en: orderRes.data.recruitment_info_en || orderRes.data.recruitment_info,
          probation: orderRes.data.probation || 'Không',
          probation_en: orderRes.data.probation_en || orderRes.data.probation || 'Không',
          probation_salary_pct: orderRes.data.probation_salary_pct,
          agent_order_status: orderRes.data.agent_order_status,
        });
        agentIds = (orderRes.data as any).agent_ids || [];
      }

      // Fetch company videos (use api route to bypass RLS for public Agent viewers)
      if (companyId) {
        const { data: { session } } = await supabase.auth.getSession();
        fetch(`/api/company/${companyId}`, {
          headers: {
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
        })
          .then(res => res.json())
          .then((resData) => {
            const data = resData.data;
            if (data) {
              const mergedMedia = data.company_media || [];
              if (data.factory_video_url && !mergedMedia.includes(data.factory_video_url)) mergedMedia.unshift(data.factory_video_url);
              if (data.job_video_url && !mergedMedia.includes(data.job_video_url)) mergedMedia.unshift(data.job_video_url);
              setCompanyVideos({ ...data, company_media: mergedMedia });
              if (data.en_company_name) {
                setOrderData(prev => prev ? { ...prev, en_company_name: data.en_company_name } : prev);
              }
            }
          })
          .catch(() => {});
      }

      const newCandidates: Candidate[] = (candRes.data || []).map((r: any) => ({
        id_ld: r.id_ld,
        order_id: r.order_id,
        agent_id: r.agent_id,
        full_name: r.full_name,
        pp_no: r.pp_no,
        dob: r.dob,
        pp_doi: r.pp_doi,
        pp_doe: r.pp_doe,
        pob: r.pob,
        address: r.address,
        phone: r.phone,
        visa_status: r.visa_status,
        passport_link: r.passport_link,
        video_link: r.video_link,
        photo_link: r.photo_link,
        height_ft: r.height_ft,
        weight_kg: r.weight_kg,
        pcc_link: r.pcc_link,
        health_cert_link: r.health_cert_link,
        interview_status: r.interview_status,
        created_at: r.created_at,
        candidate_confirmed: r.candidate_confirmed ?? null,
        video_links: r.video_links ?? null,
      })).sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA;
      });

      setCandidates(newCandidates);
      sessionStorage.setItem(cacheKey, JSON.stringify(newCandidates));

      // Fetch names for members who added candidates (for agent-owner "added by" display)
      const uniqueAgentIds = Array.from(new Set(newCandidates.map(c => c.agent_id).filter((id): id is string => !!id && id !== agentId)));
      if (uniqueAgentIds.length > 0) {
        const { data: usersData } = await supabase.from('users').select('id, full_name, short_name').in('id', uniqueAgentIds);
        const nameMap: Record<string, string> = {};
        for (const u of (usersData || [])) nameMap[u.id] = u.short_name || u.full_name || u.id;
        setMemberNameMap(nameMap);
      }

      if (agentId && orderRes.data) {
        const oaRes = await supabase
          .from('order_agents')
          .select('agent_id, assigned_labor_number')
          .eq('order_id', orderId);
        if (oaRes.data) {
          const myAllocation = oaRes.data.find((oa: any) => oa.agent_id === agentId);
          setAllocatedLabor(myAllocation?.assigned_labor_number ?? (orderRes.data.total_labor || 0));
        }
      }
    } catch (err) {
      console.error('Failed to fetch candidates:', err);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (!orderId) return;
    fetchCandidates();
  }, [orderId, fetchCandidates]);

  const focusedCandidateExists = useMemo(() => {
    if (!focusCandidateId) return false;
    return candidates.some((c) => c.id_ld === focusCandidateId);
  }, [focusCandidateId, candidates]);

  const orderedCandidates = useMemo(() => {
    if (!focusCandidateId) return candidates;
    const idx = candidates.findIndex((c) => c.id_ld === focusCandidateId);
    if (idx <= 0) return candidates;
    return [candidates[idx], ...candidates.slice(0, idx), ...candidates.slice(idx + 1)];
  }, [focusCandidateId, candidates]);

  useEffect(() => {
    if (!focusCandidateId || candidates.length === 0) return;
    const run = () => {
      const target = document.querySelector(`[data-candidate-id="${focusCandidateId}"]`);
      if (!(target instanceof HTMLElement)) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    const t = setTimeout(run, 120);
    return () => clearTimeout(t);
  }, [focusCandidateId, candidates, orderedCandidates]);

  const handleCandidateUpdate = useCallback((id: string, updates: Partial<Candidate>) => {
    setCandidates((prev) => {
      const updated = prev.map((c) => (c.id_ld === id ? { ...c, ...updates } : c));
      sessionStorage.setItem(`c_url_${orderId}`, JSON.stringify(updated));
      return updated;
    });
  }, [orderId]);

  const handleCandidateDelete = useCallback(async (id: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Chưa đăng nhập');

      const res = await fetch(`/api/candidates/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error || 'Xóa thất bại');
      }

      setCandidates((prev) => {
        const updated = prev.filter((c) => c.id_ld !== id);
        sessionStorage.setItem(`c_url_${orderId}`, JSON.stringify(updated));
        return updated;
      });
    } catch (err) {
      alert(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [orderId]);

  const handleAddCandidate = useCallback(async () => {
    if (!addForm.full_name.trim() || !addForm.pp_no.trim()) {
      setUploadMsg('Full name and passport number are required');
      setTimeout(() => setUploadMsg(null), 3000);
      return;
    }
    setAddSaving(true);
    try {
      const cleanName = addForm.full_name.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z]/g, '').toUpperCase();
      const idLd = `${addForm.pp_no.trim()}_${cleanName}`;
      const agentId = localStorage.getItem('agent_id');

      const { data: existing } = await supabase.from('candidates').select('id_ld, full_name, order_id').eq('id_ld', idLd).maybeSingle();
      if (existing) {
        setUploadMsg(`Candidate "${existing.full_name}" already exists in order ${existing.order_id}`);
        setTimeout(() => setUploadMsg(null), 4000);
        setAddSaving(false);
        return;
      }

      const { error } = await supabase.from('candidates').insert({
        id_ld: idLd,
        order_id: orderId,
        agent_id: agentId,
        full_name: addForm.full_name.trim(),
        pp_no: addForm.pp_no.trim(),
        dob: addForm.dob || null,
        pp_doi: addForm.pp_doi || null,
        pp_doe: addForm.pp_doe || null,
        pob: addForm.pob || null,
        address: addForm.address || null,
        phone: addForm.phone || null,
        height_ft: addForm.height_ft ? parseFloat(addForm.height_ft) : null,
        weight_kg: addForm.weight_kg ? parseFloat(addForm.weight_kg) : null,
      });
      if (error) throw error;

      setAddForm({ full_name: '', pp_no: '', dob: '', pp_doi: '', pp_doe: '', pob: '', address: '', phone: '', height_ft: '', weight_kg: '' });
      setShowAddForm(false);
      setUploadMsg('✅ Candidate added successfully');
      setTimeout(() => setUploadMsg(null), 3000);
      fetchCandidates();
    } catch (err) {
      const msg = err instanceof Error ? err.message : (typeof err === 'object' && err !== null && 'message' in err ? (err as { message: string }).message : String(err));
      console.error('Add candidate error:', err);
      setUploadMsg(`Error: ${msg}`);
      setTimeout(() => setUploadMsg(null), 4000);
    } finally {
      setAddSaving(false);
    }
  }, [orderId, addForm, fetchCandidates]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadMsg(null);

    const reader = new FileReader();
    reader.onloadend = () => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const maxWidth = 1500;
        const scale = Math.min(1, maxWidth / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        try {
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];

          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw new Error('Not authenticated');

          const { data: { session } } = await supabase.auth.getSession();
          const agentId = localStorage.getItem('agent_id');

          const res = await fetch('/api/passport', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
            },
            body: JSON.stringify({
              image_base64: compressedBase64,
              order_id: orderId,
              agent_id: agentId,
            }),
          });

          if (res.status === 409) {
            const warn = await res.json() as {
              duplicate: boolean;
              existing: { full_name: string; order_id: string; pp_no: string; visa_status: string | null; interview_status: string | null };
            };
            setDupWarning({
              fullName: warn.existing.full_name || 'Unknown',
              orderId: warn.existing.order_id,
              ppNo: warn.existing.pp_no || '—',
              visaStatus: warn.existing.visa_status,
              interviewStatus: warn.existing.interview_status,
            });
            setPendingUpload({ base64: compressedBase64, agentId });
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
          }

          if (!res.ok) {
            const errData = await res.json() as { error?: string };
            throw new Error(errData.error || `HTTP ${res.status}`);
          }

          const result = await res.json() as { success?: boolean; error?: string };
          if (result.success) {
            sessionStorage.removeItem(`c_url_${orderId}`);
            setUploadMsg('✅ Candidate added successfully');
            setTimeout(() => setUploadMsg(null), 3000);
            fetchCandidates();
          } else {
            setUploadMsg(`Upload failed: ${result.error || 'Unknown error'}`);
          }
        } catch (err) {
          setUploadMsg(`Upload error: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
          setIsUploading(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleConfirmUpdate = useCallback(async () => {
    if (!pendingUpload) return;
    setIsUploading(true);
    setDupWarning(null);
    const { data: { session } } = await supabase.auth.getSession();
    try {
      const res = await fetch('/api/passport', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          image_base64: pendingUpload.base64,
          order_id: orderId,
          agent_id: pendingUpload.agentId,
          forceUpdate: true,
        }),
      });
      setPendingUpload(null);
      if (res.ok) {
        sessionStorage.removeItem(`c_url_${orderId}`);
        setUploadMsg('✅ Candidate information updated');
        setTimeout(() => setUploadMsg(null), 3000);
        fetchCandidates();
      } else {
        const errData = await res.json() as { error?: string };
        setUploadMsg(`Error: ${errData.error || 'Unknown'}`);
      }
    } catch (err) {
      setUploadMsg(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsUploading(false);
    }
  }, [pendingUpload, orderId, fetchCandidates]);

  const handleVideoUploadClick = useCallback((candidateId: string) => {
    setVideoUploadingCandidate(candidateId);
    if (videoInputRef.current) videoInputRef.current.click();
  }, []);

  const handleVideoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setVideoUploadingCandidate(null);
      return;
    }
    if (!videoUploadingCandidate) return;

    setUploadMsg(`⏳ Uploading video... Please don't close the browser.`);

    const fileExt = file.name.split('.').pop();
    const safeOrderId = orderId.replace(/[^a-zA-Z0-9-]/g, '_');
    const safeCandidateId = videoUploadingCandidate.replace(/[^a-zA-Z0-9-]/g, '_');
    const filePath = `${safeOrderId}/${safeCandidateId}/${Date.now()}.${fileExt}`;

    try {
      const { error } = await supabase.storage
        .from('agent-media')
        .upload(filePath, file, { cacheControl: '3600', upsert: false });
      if (error) throw error;

      const { data: publicUrlData } = supabase.storage.from('agent-media').getPublicUrl(filePath);
      const videoUrl = publicUrlData.publicUrl;

      await supabase.from('candidates').update({ video_link: videoUrl }).eq('id_ld', videoUploadingCandidate);

      const larkUrl = process.env.NEXT_PUBLIC_N8N_VIDEO_UPDATE_URL;
      if (larkUrl) {
        await fetch(larkUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ candidate_id: videoUploadingCandidate, video_link: videoUrl }),
        });
      }

      const notifyUrl = process.env.NEXT_PUBLIC_N8N_VIDEO_NOTIFY_URL;
      if (notifyUrl) {
        const candidate = candidates.find((c) => c.id_ld === videoUploadingCandidate);
        fetch(notifyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            candidate_id: videoUploadingCandidate,
            full_name: candidate?.full_name ?? '',
            order_id: orderId,
            video_link: videoUrl,
          }),
        }).catch(() => {});
      }

      setUploadMsg(`✅ Video uploaded successfully!`);
      handleCandidateUpdate(videoUploadingCandidate, { video_link: videoUrl });
      setTimeout(() => setUploadMsg(null), 5000);
    } catch (err) {
      setUploadMsg(`❌ Video Upload Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (videoInputRef.current) videoInputRef.current.value = '';
      setVideoUploadingCandidate(null);
    }
  };

  const handleToggleSelect = useCallback((id: string, selected: boolean) => {
    setSelectedCandidates(prev => selected ? [...prev, id] : prev.filter(x => x !== id));
  }, []);

  const handleSelectAll = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) setSelectedCandidates(candidates.map(c => c.id_ld));
    else setSelectedCandidates([]);
  }, [candidates]);

  const handleExportCSV = useCallback(() => {
    const selected = candidates.filter(c => selectedCandidates.includes(c.id_ld));
    if (selected.length === 0) return;
    
    const headers = ['Full Name', 'Passport No', 'Date of Birth', 'Place of Birth', 'Address', 'Phone', 'Height (ft)', 'Weight (kg)', 'Visa Status', 'Interview Status'];
    const rows = selected.map(c => [
      c.full_name || '', c.pp_no || '', c.dob || '', c.pob || '', c.address || '', c.phone || '', 
      c.height_ft || '', c.weight_kg || '', c.visa_status || '', c.interview_status || ''
    ]);
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(','), ...rows.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Candidates_${orderId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [candidates, selectedCandidates, orderId]);

  if (loading) return <LoadingSkeleton type="order" />;

  const totalLabor = Number(orderData?.total_labor) || 0;
  const agentStatus = orderData ? getAgentOrderStatus(orderData, candidates.length) : null;

  const allocated = allocatedLabor;
  const agentPassed = currentAgentId
    ? candidates.filter(c => c.agent_id === currentAgentId && c.interview_status === 'Passed').length
    : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {viewerIndex !== null && companyVideos?.company_media && (
        <MediaViewer
          media={companyVideos.company_media}
          index={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onNav={setViewerIndex}
        />
      )}
      {candidateVideoUrl && (
        <MediaViewer
          media={[candidateVideoUrl]}
          index={0}
          onClose={() => setCandidateVideoUrl(null)}
          onNav={() => {}}
        />
      )}
      {/* Hidden inputs */}
      <input type="file" accept="video/*" ref={videoInputRef} onChange={handleVideoChange} className="hidden" />
      <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} className="hidden" />

      {/* Sticky top bar */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-20">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          >
            ←
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-gray-800 truncate">{orderId}</h1>
            {orderData?.company && (
              <p className="text-xs text-gray-500 truncate">{orderData.company}</p>
            )}
          </div>
          {agentStatus && (
            <span className={`flex-shrink-0 text-xs font-medium px-2 py-1 rounded-full ${agentStatus.cls}`}>
              {agentStatus.label}
            </span>
          )}
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">

        {/* Order Details */}
        {orderData && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Action Buttons */}
            {(demandLetterUrl || orderData.url_demand_letter || orderData.url_order) && (
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex flex-wrap gap-2">
                {(demandLetterUrl || orderData.url_demand_letter) && (
                  <a
                    href={demandLetterUrl || orderData.url_demand_letter || '#'}
                    target="_blank" rel="noopener noreferrer"
                    className="text-xs bg-blue-100 text-blue-700 px-3 py-2 rounded-lg hover:bg-blue-200 min-h-[36px] flex items-center"
                  >
                    Demand Letter ↗
                  </a>
                )}
                {orderData.url_order && (
                  <a
                    href={orderData.url_order}
                    target="_blank" rel="noopener noreferrer"
                    className="text-xs bg-indigo-100 text-indigo-700 px-3 py-2 rounded-lg hover:bg-indigo-200 min-h-[36px] flex items-center"
                  >
                    Recruitment Info (YCTD) ↗
                  </a>
                )}
              </div>
            )}

            {/* Images/Videos Grid */}
            {companyVideos?.company_media && companyVideos.company_media.length > 0 && (
              <div className="px-4 py-3 bg-white border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Company Media</h3>
                <div className="relative group/slider">
                  <div ref={mediaScrollRef} className="flex gap-2 overflow-x-auto pb-2 scroll-smooth">
                    {companyVideos.company_media.map((url, i) => {
                      const isVideo = url.match(/\.(mp4|webm|mov)$/i);
                      return (
                        <div key={i} className="relative flex-shrink-0 cursor-pointer group" onClick={() => setViewerIndex(i)}>
                           {isVideo ? (
                             <div className="h-24 w-32 bg-gray-900 rounded-lg border border-gray-200 flex flex-col items-center justify-center">
                               <span className="text-white text-2xl group-hover:scale-110 transition-transform mb-1">▶</span>
                               <span className="text-gray-400 text-[10px] font-medium">VIDEO</span>
                             </div>
                           ) : (
                             <img src={url} alt={`Company ${i}`} className="h-24 w-32 object-cover rounded-lg border border-gray-200 group-hover:opacity-90" />
                           )}
                        </div>
                      );
                    })}
                  </div>
                  {companyVideos.company_media.length > 2 && (
                    <>
                      <button onClick={() => mediaScrollRef.current?.scrollBy({ left: -200, behavior: 'smooth' })} className="absolute left-0 top-[40%] -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-white/90 shadow border border-gray-200 text-gray-700 rounded-full opacity-60 hover:opacity-100">
                        ◀
                      </button>
                      <button onClick={() => mediaScrollRef.current?.scrollBy({ left: 200, behavior: 'smooth' })} className="absolute right-0 top-[40%] -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-white/90 shadow border border-gray-200 text-gray-700 rounded-full opacity-60 hover:opacity-100">
                        ▶
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Company & Order Info List */}
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-xl font-bold text-emerald-700 mb-3">
                {orderData.en_company_name || orderData.company || "N/A"}
              </h2>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-start">
                  <span className="text-gray-400 mr-2 mt-0.5">•</span>
                  <div><strong className="text-gray-800">Total worker:</strong> {allocated}</div>
                </li>
                <li className="flex items-start">
                  <span className="text-gray-400 mr-2 mt-0.5">•</span>
                  <div><strong className="text-gray-800">Job Type:</strong> {orderData.job_type_en || orderData.job_type || 'N/A'}</div>
                </li>
                {(companyVideos?.en_industry || companyVideos?.industry) && (
                  <li className="flex items-start">
                    <span className="text-gray-400 mr-2 mt-0.5">•</span>
                    <div><strong className="text-gray-800">Industry:</strong> {companyVideos.en_industry || companyVideos.industry}</div>
                  </li>
                )}
                <li className="flex items-start">
                  <span className="text-gray-400 mr-2 mt-0.5">•</span>
                  <div><strong className="text-gray-800">Salary:</strong> {orderData.salary_usd ? `${orderData.salary_usd.toLocaleString()} USD` : 'N/A'}</div>
                </li>
                {(orderData.meal_en || orderData.meal) && (
                  <li className="flex items-start">
                    <span className="text-gray-400 mr-2 mt-0.5">•</span>
                    <div><strong className="text-gray-800">Meal:</strong> {orderData.meal_en || orderData.meal}</div>
                  </li>
                )}
                {(orderData.dormitory_en || orderData.dormitory) && (
                  <li className="flex items-start">
                    <span className="text-gray-400 mr-2 mt-0.5">•</span>
                    <div><strong className="text-gray-800">Dormitory:</strong> {orderData.dormitory_en || orderData.dormitory}</div>
                  </li>
                )}
                {orderData.probation_en && (
                  <li className="flex items-start">
                    <span className="text-gray-400 mr-2 mt-0.5">•</span>
                    <div><strong className="text-gray-800">Probation (EN):</strong> {orderData.probation_en}</div>
                  </li>
                )}
              </ul>
            </div>

            {/* Probation badge */}
            {orderData.probation && orderData.probation !== 'Không' && (
              <div className="px-4 py-3 border-t border-gray-100">
                <span className="inline-flex items-center gap-1.5 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1.5 rounded-full font-medium">
                  Probation: {orderData.probation}
                  {orderData.probation_salary_pct ? `, ${orderData.probation_salary_pct}% salary` : ''}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Recruitment Productivity */}
        {orderData && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Recruitment Productivity</h3>
            <div className="grid grid-cols-4 gap-3 text-center">
              <div>
                <p className="text-xs text-gray-400 mb-1">Applied</p>
                <p className="text-2xl font-bold text-blue-600">{candidates.length}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">Target</p>
                <p className="text-2xl font-bold text-slate-800">{allocated}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">Passed</p>
                <p className="text-2xl font-bold text-green-600">{agentPassed}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">Remaining</p>
                <p className="text-2xl font-bold text-red-500">{Math.max(0, allocated - agentPassed)}</p>
              </div>
            </div>
          </div>
        )}

        {/* Upload message */}
        {uploadMsg && (
          <div className="p-3 bg-white border border-gray-200 rounded-xl shadow-sm text-center text-sm font-medium">
            {uploadMsg}
          </div>
        )}

        {focusCandidateId && !loading && (
          <div className={`p-3 rounded-xl border text-sm ${focusedCandidateExists ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
            {focusedCandidateExists
              ? `Focused candidate: ${focusCandidateId}`
              : `Candidate not found in this order: ${focusCandidateId}`}
          </div>
        )}

        {/* Candidates */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
              <input type="checkbox" onChange={handleSelectAll} checked={candidates.length > 0 && selectedCandidates.length === candidates.length} className="w-4 h-4 rounded text-blue-600 border-gray-300" />
              Candidates ({candidates.length})
            </h2>
            {selectedCandidates.length > 0 && (
              <button onClick={handleExportCSV} className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors">
                📥 Export CSV ({selectedCandidates.length})
              </button>
            )}
          </div>
          {candidates.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">No candidates found for this order.</p>
          ) : (
            <div className="space-y-3">
              {orderedCandidates.map((c) => (
                <CandidateCard
                  key={c.id_ld}
                  candidate={c}
                  orderId={orderId}
                  onVideoUploadClick={handleVideoUploadClick}
                  onCandidateUpdate={handleCandidateUpdate}
                  onCandidateDelete={handleCandidateDelete}
                  isVideoUploading={videoUploadingCandidate === c.id_ld}
                  onVideoPlay={(url) => setCandidateVideoUrl(url)}
                  isSelected={selectedCandidates.includes(c.id_ld)}
                  onToggleSelect={handleToggleSelect}
                  addedBy={c.agent_id && c.agent_id !== currentAgentId ? memberNameMap[c.agent_id] : undefined}
                  canSetStatus={currentUserRole !== 'member'}
                  isFocused={focusCandidateId === c.id_ld}
                />
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Duplicate candidate confirm modal */}
      {dupWarning && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl shadow-xl p-5 space-y-4">
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto sm:hidden" />
            <div className="flex items-start gap-3 pt-1">
              <span className="text-2xl flex-shrink-0">⚠️</span>
              <div>
                <h3 className="font-bold text-slate-800">Candidate already exists</h3>
                <p className="text-sm text-gray-600 mt-1">
                  <span className="font-medium">{dupWarning.fullName}</span> (PP: {dupWarning.ppNo}) is already in order{' '}
                  <span className="text-blue-600 font-medium">{dupWarning.orderId}</span>.
                </p>
                {(dupWarning.visaStatus || dupWarning.interviewStatus) && (
                  <p className="text-xs text-gray-500 mt-1">
                    {dupWarning.visaStatus && `Visa: ${dupWarning.visaStatus}`}
                    {dupWarning.visaStatus && dupWarning.interviewStatus && ' · '}
                    {dupWarning.interviewStatus && `Interview: ${dupWarning.interviewStatus}`}
                  </p>
                )}
                <p className="text-sm text-gray-600 mt-2">Update with new passport info?</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setDupWarning(null); setPendingUpload(null); }}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 rounded-xl text-sm min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmUpdate}
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-semibold py-3 rounded-xl text-sm min-h-[44px]"
              >
                Update
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Action Button */}
      <div ref={fabRef} className="fixed bottom-6 right-6 z-30">
        {fabMenuOpen ? (
          <div className="flex flex-col gap-2 items-end mb-2">
            <button
              onClick={() => { setFabMenuOpen(false); fileInputRef.current?.click(); }}
              className="flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-lg border border-gray-200 hover:bg-gray-50 transition-colors min-h-[44px]"
            >
              <span className="text-sm font-medium text-gray-700">Passport</span>
              <span className="text-xl">🪪</span>
            </button>
            <button
              onClick={() => { setFabMenuOpen(false); setShowAddForm(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-lg border border-gray-200 hover:bg-gray-50 transition-colors min-h-[44px]"
            >
              <span className="text-sm font-medium text-gray-700">Add Candidate</span>
              <span className="text-xl">👤</span>
            </button>
          </div>
        ) : null}
        <button
          onClick={() => setFabMenuOpen(!fabMenuOpen)}
          className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-2xl transition-all ${
            fabMenuOpen ? 'bg-red-500 hover:bg-red-600 rotate-45' : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {fabMenuOpen ? '✕' : '+'}
        </button>
      </div>

      {/* Add Candidate Modal */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowAddForm(false)}>
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-xl p-5 pb-8 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4 sm:hidden" />
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-slate-800 text-lg">Add Candidate</h3>
              <button onClick={() => setShowAddForm(false)} className="text-gray-400 text-xl min-h-[44px] min-w-[44px] flex items-center justify-center">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Full Name *</label>
                <input type="text" value={addForm.full_name} onChange={(e) => setAddForm(f => ({ ...f, full_name: e.target.value }))} placeholder="NGUYEN VAN A" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Passport No *</label>
                <input type="text" value={addForm.pp_no} onChange={(e) => setAddForm(f => ({ ...f, pp_no: e.target.value }))} placeholder="C1234567" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Date of Birth</label>
                  <input type="date" value={addForm.dob} onChange={(e) => setAddForm(f => ({ ...f, dob: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Place of Birth</label>
                  <input type="text" value={addForm.pob} onChange={(e) => setAddForm(f => ({ ...f, pob: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Passport Issue Date</label>
                  <input type="date" value={addForm.pp_doi} onChange={(e) => setAddForm(f => ({ ...f, pp_doi: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Passport Expiry Date</label>
                  <input type="date" value={addForm.pp_doe} onChange={(e) => setAddForm(f => ({ ...f, pp_doe: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Address</label>
                <input type="text" value={addForm.address} onChange={(e) => setAddForm(f => ({ ...f, address: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Phone</label>
                <input type="tel" value={addForm.phone} onChange={(e) => setAddForm(f => ({ ...f, phone: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Height (ft)</label>
                  <input type="number" step="0.1" value={addForm.height_ft} onChange={(e) => setAddForm(f => ({ ...f, height_ft: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Weight (kg)</label>
                  <input type="number" step="0.1" value={addForm.weight_kg} onChange={(e) => setAddForm(f => ({ ...f, weight_kg: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]" />
                </div>
              </div>
            </div>
            <button
              onClick={handleAddCandidate}
              disabled={addSaving || !addForm.full_name.trim() || !addForm.pp_no.trim()}
              className="mt-4 w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm min-h-[44px]"
            >
              {addSaving ? '⏳ Saving...' : 'Save Candidate'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
