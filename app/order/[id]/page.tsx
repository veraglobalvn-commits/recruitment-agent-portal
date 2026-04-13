'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { Candidate, Order } from '@/lib/types';
import CandidateCard from '@/components/CandidateCard';
import LoadingSkeleton from '@/components/LoadingSkeleton';

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
  const [agents, setAgents] = useState<any[]>([]);
  const [currentAgentId, setCurrentAgentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [videoUploadingCandidate, setVideoUploadingCandidate] = useState<string | null>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [dupWarning, setDupWarning] = useState<{
    fullName: string; orderId: string; ppNo: string;
    visaStatus: string | null; interviewStatus: string | null;
  } | null>(null);
  const [pendingUpload, setPendingUpload] = useState<{ base64: string; agentId: string | null } | null>(null);

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
      if (orderRes.data) {
        setOrderData({
          order_id: orderRes.data.id,
          company: orderRes.data.company_name,
          total_labor: orderRes.data.total_labor,
          missing: orderRes.data.labor_missing,
          status: orderRes.data.status || 'N/A',
          url_demand_letter: orderRes.data.url_demand_letter,
          job_type: orderRes.data.job_type,
          job_type_en: orderRes.data.job_type_en,
          salary_usd: orderRes.data.salary_usd,
          url_order: orderRes.data.url_order,
          meal: orderRes.data.meal,
          dormitory: orderRes.data.dormitory,
          recruitment_info: orderRes.data.recruitment_info,
        });
        agentIds = (orderRes.data as any).agent_ids || [];
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

      if (agentIds.length > 0 && agentId) {
        const agentsRes = await supabase
          .from('agents')
          .select('id, full_name, short_name, labor_percentage');
        if (agentsRes.data) {
          const allAgents = agentsRes.data;
          const currentAgent = allAgents.find((a: any) => a.id === agentId);
          if (currentAgent) {
            setAgents([currentAgent]);
          }
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
      alert(`Xoá thất bại: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [orderId]);

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

          // Ứng viên đã tồn tại → hỏi confirm trước khi ghi đè
          if (res.status === 409) {
            const warn = await res.json() as {
              duplicate: boolean;
              existing: { full_name: string; order_id: string; pp_no: string; visa_status: string | null; interview_status: string | null };
            };
            setDupWarning({
              fullName: warn.existing.full_name || 'Không rõ',
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
            setUploadMsg('✅ Đã thêm ứng viên thành công');
            setTimeout(() => setUploadMsg(null), 3000);
            fetchCandidates();
          } else {
            setUploadMsg(`Upload thất bại: ${result.error || 'Unknown error'}`);
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
        setUploadMsg('✅ Đã cập nhật thông tin ứng viên');
        setTimeout(() => setUploadMsg(null), 3000);
        fetchCandidates();
      } else {
        const errData = await res.json() as { error?: string };
        setUploadMsg(`Lỗi: ${errData.error || 'Không rõ'}`);
      }
    } catch (err) {
      setUploadMsg(`Lỗi: ${err instanceof Error ? err.message : String(err)}`);
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

  return (
    <div className="min-h-screen bg-gray-50">
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
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex-shrink-0 text-xs bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 min-h-[44px] flex items-center"
          >
            {isUploading ? '⏳' : '+ Passport'}
          </button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">

        {/* Order Details */}
        {orderData && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
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
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-gray-100">
              {[
                { label: 'Company', value: orderData.company },
                { label: 'Total Labor', value: orderData.total_labor },
                { label: 'Job Type', value: orderData.job_type_en },
                { label: 'Salary (USD)', value: orderData.salary_usd ? `$${orderData.salary_usd.toLocaleString()}` : null },
                { label: 'Meal', value: orderData.meal },
                { label: 'Dormitory', value: orderData.dormitory },
              ].map(({ label, value }) => (
                <div key={label} className="bg-white px-4 py-3">
                  <p className="text-gray-400 text-xs uppercase tracking-wider">{label}</p>
                  <p className="font-semibold text-gray-800 text-sm mt-0.5">{value || 'N/A'}</p>
                </div>
              ))}
            </div>
            {orderData.recruitment_info && (
              <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
                <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">Recruitment Info</p>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{orderData.recruitment_info}</p>
              </div>
            )}
          </div>
        )}

        {/* Recruitment Efficiency */}
        {orderData && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Hiệu quả tuyển dụng</h3>
            {agents.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">Bạn chưa được phân công cho đơn hàng này</p>
            ) : (
              <div className="space-y-4">
                {agents.map((agent) => {
                  const allocatedLabor = agent.labor_percentage
                    ? Math.round((agent.labor_percentage / 100) * Number(orderData.total_labor))
                    : 0;
                  const passedCount = candidates.filter(
                    c => c.agent_id === agent.id && c.interview_status === 'Passed'
                  ).length;
                  const percentage = allocatedLabor > 0
                    ? Math.min(100, (passedCount / allocatedLabor) * 100)
                    : 0;

                  return (
                    <div key={agent.id} className="space-y-2">
                      <div className="flex items-center gap-3">
                        {agent.avatar_url ? (
                          <img src={agent.avatar_url} alt={agent.short_name || agent.full_name || 'Agent'} className="w-10 h-10 rounded-full object-cover border-2 border-gray-200" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">
                            {(agent.short_name || agent.full_name || 'A')[0].toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-800 text-sm">{agent.short_name || agent.full_name || 'Agent'}</p>
                          <p className="text-xs text-gray-500">
                            Phân công: {allocatedLabor} người ({agent.labor_percentage}%)
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-gray-800">{passedCount} / {allocatedLabor}</p>
                          <p className="text-xs text-gray-500">{percentage.toFixed(1)}%</p>
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <div
                          className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Upload message */}
        {uploadMsg && (
          <div className="p-3 bg-white border border-gray-200 rounded-xl shadow-sm text-center text-sm font-medium">
            {uploadMsg}
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
                />
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Confirm modal khi ứng viên đã tồn tại */}
      {dupWarning && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl shadow-xl p-5 space-y-4">
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto sm:hidden" />
            <div className="flex items-start gap-3 pt-1">
              <span className="text-2xl flex-shrink-0">⚠️</span>
              <div>
                <h3 className="font-bold text-slate-800">Ứng viên đã tồn tại</h3>
                <p className="text-sm text-gray-600 mt-1">
                  <span className="font-medium">{dupWarning.fullName}</span> (PP: {dupWarning.ppNo}) đã có trong đơn hàng{' '}
                  <span className="text-blue-600 font-medium">{dupWarning.orderId}</span>.
                </p>
                {(dupWarning.visaStatus || dupWarning.interviewStatus) && (
                  <p className="text-xs text-gray-500 mt-1">
                    {dupWarning.visaStatus && `Visa: ${dupWarning.visaStatus}`}
                    {dupWarning.visaStatus && dupWarning.interviewStatus && ' · '}
                    {dupWarning.interviewStatus && `PV: ${dupWarning.interviewStatus}`}
                  </p>
                )}
                <p className="text-sm text-gray-600 mt-2">Bạn có muốn cập nhật thông tin từ hộ chiếu mới này không?</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setDupWarning(null); setPendingUpload(null); }}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 rounded-xl text-sm min-h-[44px]"
              >
                Huỷ
              </button>
              <button
                onClick={handleConfirmUpdate}
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-semibold py-3 rounded-xl text-sm min-h-[44px]"
              >
                Cập nhật
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
