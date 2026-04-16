'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { Candidate, Order } from '@/lib/types';
import CandidateCard from '@/components/CandidateCard';
import LoadingSkeleton from '@/components/LoadingSkeleton';

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

interface CompanyVideos {
  factory_video_url: string | null;
  job_video_url: string | null;
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

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [orderData, setOrderData] = useState<Order | null>(null);
  const [companyVideos, setCompanyVideos] = useState<CompanyVideos | null>(null);
  const [currentAgentId, setCurrentAgentId] = useState<string | null>(null);
  const [allocatedLabor, setAllocatedLabor] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [videoUploadingCandidate, setVideoUploadingCandidate] = useState<string | null>(null);
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);
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

  const fetchCandidates = useCallback(async () => {
    try {
      const agentId = localStorage.getItem('agent_id');
      setCurrentAgentId(agentId);

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

      // Fetch company videos
      if (companyId) {
        supabase
          .from('companies')
          .select('factory_video_url, job_video_url')
          .eq('id', companyId)
          .single()
          .then(({ data }) => {
            if (data) setCompanyVideos({ factory_video_url: data.factory_video_url, job_video_url: data.job_video_url });
          });
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
      })).sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA;
      });

      setCandidates(newCandidates);
      sessionStorage.setItem(cacheKey, JSON.stringify(newCandidates));

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

  const handleCandidateUpdate = useCallback((id: string, updates: Partial<Candidate>) => {
    setCandidates((prev) => {
      const updated = prev.map((c) => (c.id_ld === id ? { ...c, ...updates } : c));
      sessionStorage.setItem(`c_url_${orderId}`, JSON.stringify(updated));
      return updated;
    });
  }, [orderId]);

  const handleCandidateDelete = useCallback(async (id: string) => {
    try {
      const { error } = await supabase
        .from('candidates')
        .delete()
        .eq('id_ld', id);
      if (error) throw error;

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
      setUploadMsg(`Error: ${err instanceof Error ? err.message : String(err)}`);
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

  if (loading) return <LoadingSkeleton type="order" />;

  const totalLabor = Number(orderData?.total_labor) || 0;
  const agentStatus = orderData ? getAgentOrderStatus(orderData, candidates.length) : null;

  const allocated = allocatedLabor;
  const agentPassed = currentAgentId
    ? candidates.filter(c => c.agent_id === currentAgentId && c.interview_status === 'Passed').length
    : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {playingVideo && <VideoPlayer url={playingVideo} onClose={() => setPlayingVideo(null)} />}
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
          {orderData?.url_order && (
            <a
              href={orderData.url_order}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 text-xs bg-blue-100 text-blue-700 px-3 py-2 rounded-lg hover:bg-blue-200 min-h-[44px] flex items-center"
            >
              📄 View Recruitment Info
            </a>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex-shrink-0 text-xs bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 min-h-[44px] flex items-center"
          >
            {isUploading ? '⏳' : '+ Passport'}
          </button>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex-shrink-0 text-xs bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 min-h-[44px] flex items-center"
          >
            {showAddForm ? '✕ Cancel' : '+ Add Candidate'}
          </button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">

        {/* Order Details */}
        {orderData && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Video buttons + Demand Letter */}
            {(companyVideos?.factory_video_url || companyVideos?.job_video_url || demandLetterUrl || orderData.url_demand_letter) && (
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex flex-wrap gap-2">
                {companyVideos?.factory_video_url && (
                  <button
                    onClick={() => setPlayingVideo(companyVideos.factory_video_url!)}
                    className="text-xs bg-indigo-100 text-indigo-700 px-3 py-2 rounded-lg hover:bg-indigo-200 min-h-[36px] flex items-center gap-1"
                  >
                    ▶ Factory Video
                  </button>
                )}
                {companyVideos?.job_video_url && (
                  <button
                    onClick={() => setPlayingVideo(companyVideos.job_video_url!)}
                    className="text-xs bg-purple-100 text-purple-700 px-3 py-2 rounded-lg hover:bg-purple-200 min-h-[36px] flex items-center gap-1"
                  >
                    ▶ Job Video
                  </button>
                )}
                {(demandLetterUrl || orderData.url_demand_letter) && (
                  <a
                    href={demandLetterUrl || orderData.url_demand_letter || '#'}
                    target="_blank" rel="noopener noreferrer"
                    className="text-xs bg-blue-100 text-blue-700 px-3 py-2 rounded-lg hover:bg-blue-200 min-h-[36px] flex items-center"
                  >
                    Demand Letter ↗
                  </a>
                )}
              </div>
            )}

            {/* Info grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-gray-100">
              {[
                { label: 'Company', value: orderData.en_company_name || orderData.company },
                { label: 'Target', value: allocated },
                { label: 'Job Type', value: orderData.job_type_en || orderData.job_type },
                { label: 'Salary (USD)', value: orderData.salary_usd ? `$${orderData.salary_usd.toLocaleString()}` : null },
                { label: 'Meal', value: orderData.meal_en || orderData.meal },
                { label: 'Dormitory', value: orderData.dormitory_en || orderData.dormitory },
                { label: 'Probation (EN)', value: orderData.probation_en },
              ].map(({ label, value }) => (
                <div key={label} className="bg-white px-4 py-3">
                  <p className="text-gray-400 text-xs uppercase tracking-wider">{label}</p>
                  <p className="font-semibold text-gray-800 text-sm mt-0.5">{value ?? 'N/A'}</p>
                </div>
              ))}
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
            <div className="flex items-center justify-between text-center">
              <div>
                <p className="text-xs text-gray-400 mb-1">Total Workers</p>
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

        {/* Add Candidate Form */}
        {showAddForm && (
          <div className="bg-white rounded-2xl border border-blue-200 shadow-sm p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">Add Candidate</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Full Name *</label>
                <input type="text" value={addForm.full_name} onChange={(e) => setAddForm(f => ({ ...f, full_name: e.target.value }))} placeholder="NGUYEN VAN A" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Passport No *</label>
                <input type="text" value={addForm.pp_no} onChange={(e) => setAddForm(f => ({ ...f, pp_no: e.target.value }))} placeholder="C1234567" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Date of Birth</label>
                <input type="date" value={addForm.dob} onChange={(e) => setAddForm(f => ({ ...f, dob: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Passport Issue Date</label>
                <input type="date" value={addForm.pp_doi} onChange={(e) => setAddForm(f => ({ ...f, pp_doi: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Passport Expiry Date</label>
                <input type="date" value={addForm.pp_doe} onChange={(e) => setAddForm(f => ({ ...f, pp_doe: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Place of Birth</label>
                <input type="text" value={addForm.pob} onChange={(e) => setAddForm(f => ({ ...f, pob: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Address</label>
                <input type="text" value={addForm.address} onChange={(e) => setAddForm(f => ({ ...f, address: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Phone</label>
                <input type="tel" value={addForm.phone} onChange={(e) => setAddForm(f => ({ ...f, phone: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Height (ft)</label>
                <input type="number" step="0.1" value={addForm.height_ft} onChange={(e) => setAddForm(f => ({ ...f, height_ft: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Weight (kg)</label>
                <input type="number" step="0.1" value={addForm.weight_kg} onChange={(e) => setAddForm(f => ({ ...f, weight_kg: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
            </div>
            <button
              onClick={handleAddCandidate}
              disabled={addSaving || !addForm.full_name.trim() || !addForm.pp_no.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm min-h-[44px]"
            >
              {addSaving ? '⏳ Saving...' : 'Save Candidate'}
            </button>
          </div>
        )}

        {/* Candidates */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Candidates ({candidates.length})
          </h2>
          {candidates.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">No candidates found for this order.</p>
          ) : (
            <div className="space-y-3">
              {candidates.map((c) => (
                <CandidateCard
                  key={c.id_ld}
                  candidate={c}
                  orderId={orderId}
                  onVideoUploadClick={handleVideoUploadClick}
                  onCandidateUpdate={handleCandidateUpdate}
                  onCandidateDelete={handleCandidateDelete}
                  isVideoUploading={videoUploadingCandidate === c.id_ld}
                  onVideoPlay={(url) => setPlayingVideo(url)}
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
    </div>
  );
}
