'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { Candidate, AgentOption } from '@/lib/types';
import Link from 'next/link';
import CandidateCard from '@/components/CandidateCard';

type StatusFilter = 'all' | 'Passed' | 'Failed' | 'Pending';

interface OrderBrief {
  id: string;
  company_name: string | null;
  job_type: string | null;
}

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'Passed', label: 'Passed' },
  { key: 'Failed', label: 'Failed' },
  { key: 'Pending', label: 'Pending' },
];

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

function SearchDropdown({
  placeholder,
  items,
  selectedKey,
  onSelect,
}: {
  placeholder: string;
  items: { key: string; label: string; sub?: string }[];
  selectedKey: string;
  onSelect: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const selected = items.find((i) => i.key === selectedKey);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = q
    ? items.filter((i) => i.label.toLowerCase().includes(q.toLowerCase()) || (i.sub ?? '').toLowerCase().includes(q.toLowerCase()))
    : items;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => { setOpen(!open); setQ(''); }}
        className="w-full text-left text-xs border border-gray-200 rounded-lg px-3 py-2 min-h-[44px] bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 flex items-center gap-1 truncate"
      >
        {selected ? <span className="truncate">{selected.label}</span> : <span className="text-gray-400">{placeholder}</span>}
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 max-h-56 flex flex-col">
          <div className="p-2 border-b border-gray-100">
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm..."
              autoFocus
              className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 min-h-[36px]"
            />
          </div>
          <div className="overflow-y-auto flex-1">
            <button
              onClick={() => { onSelect('all'); setOpen(false); }}
              className={`w-full text-left px-3 py-2.5 text-xs hover:bg-blue-50 min-h-[40px] flex items-center gap-2 ${selectedKey === 'all' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'}`}
            >
              Tất cả
            </button>
            {filtered.filter((i) => i.key !== 'all').map((item) => (
              <button
                key={item.key}
                onClick={() => { onSelect(item.key); setOpen(false); }}
                className={`w-full text-left px-3 py-2.5 text-xs hover:bg-blue-50 min-h-[40px] flex items-center gap-2 ${selectedKey === item.key ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'}`}
              >
                <span className="truncate">{item.label}</span>
                {item.sub && <span className="text-gray-400 flex-shrink-0">{item.sub}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [orders, setOrders] = useState<OrderBrief[]>([]);
  const [filtered, setFiltered] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [orderFilter, setOrderFilter] = useState<string>('all');
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);
  const [videoUploadingCandidate, setVideoUploadingCandidate] = useState<string | null>(null);
  const [newVideoCandidates, setNewVideoCandidates] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('newVideoCandidates');
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  const videoInputRef = useRef<HTMLInputElement>(null);

  const agentMap = new Map(agents.map((a) => [a.id, a]));
  const orderMap = new Map(orders.map((o) => [o.id, o]));

  const load = useCallback(async () => {
    setLoading(true);
    const [candRes, agRes, ordRes] = await Promise.all([
      supabase.from('candidates').select('*'),
      supabase.from('agents').select('id, full_name, short_name').neq('role', 'admin'),
      supabase.from('orders').select('id, company_name, job_type'),
    ]);
    const candidates = (candRes.data ?? []) as Candidate[];
    candidates.sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return dateB - dateA;
    });
    setCandidates(candidates);
    setAgents((agRes.data ?? []) as AgentOption[]);
    setOrders((ordRes.data ?? []) as OrderBrief[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Lưu newVideoCandidates vào localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('newVideoCandidates', JSON.stringify(newVideoCandidates));
    }
  }, [newVideoCandidates]);

  useEffect(() => {
    const q = search.toLowerCase();
    const filtered = candidates
      .filter((c) => {
        const matchSearch =
          (c.full_name ?? '').toLowerCase().includes(q) ||
          (c.pp_no ?? '').toLowerCase().includes(q) ||
          (c.id_ld ?? '').toLowerCase().includes(q);
        const matchStatus =
          statusFilter === 'all' ||
          (statusFilter === 'Pending' && !c.interview_status) ||
          c.interview_status === statusFilter;
        const matchAgent = agentFilter === 'all' || c.agent_id === agentFilter;
        const matchOrder = orderFilter === 'all' || c.order_id === orderFilter;
        return matchSearch && matchStatus && matchAgent && matchOrder;
      })
      .sort((a, b) => {
        const aIsNewVideo = newVideoCandidates.includes(a.id_ld);
        const bIsNewVideo = newVideoCandidates.includes(b.id_ld);
        
        // Ưu tiên 1: Ứng viên mới gửi video lên đầu
        if (aIsNewVideo && !bIsNewVideo) return -1;
        if (!aIsNewVideo && bIsNewVideo) return 1;
        
        // Ưu tiên 2: Ứng viên có video lên trước
        if (a.video_link && !b.video_link) return -1;
        if (!a.video_link && b.video_link) return 1;
        
        // Ưu tiên 3: Sắp xếp theo ngày tạo mới nhất
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA;
      });

    setFiltered(filtered);
  }, [search, statusFilter, agentFilter, orderFilter, candidates, newVideoCandidates]);

  const handleStatusChange = useCallback(async (candidateId: string, status: 'Passed' | 'Failed') => {
    setCandidates((prev) => prev.map((c) => c.id_ld === candidateId ? { ...c, interview_status: status } : c));
    setNewVideoCandidates((prev) => prev.filter((id) => id !== candidateId));
    try {
      const { error } = await supabase.from('candidates').update({ interview_status: status }).eq('id_ld', candidateId);
      if (error) throw new Error(error.message);
    } catch (err) {
      alert(`Lỗi: ${err instanceof Error ? err.message : String(err)}`);
      setCandidates((prev) => prev.map((c) => c.id_ld === candidateId ? { ...c, interview_status: c.interview_status } : c));
    }
  }, []);

  const handleCandidateUpdate = useCallback((cid: string, updates: Partial<Candidate>) => {
    setCandidates((prev) => prev.map((c) => (c.id_ld === cid ? { ...c, ...updates } : c)));
  }, []);

  const handleVideoUploadClick = useCallback((candidateId: string) => {
    setVideoUploadingCandidate(candidateId);
    videoInputRef.current?.click();
  }, []);

  const handleVideoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !videoUploadingCandidate) return;
    const fileExt = file.name.split('.').pop();
    const safeCandidateId = videoUploadingCandidate.replace(/[^a-zA-Z0-9]/g, '_');
    const filePath = `candidates/${safeCandidateId}/${Date.now()}.${fileExt}`;
    try {
      const { error } = await supabase.storage.from('agent-media').upload(filePath, file, { cacheControl: '3600', upsert: false });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('agent-media').getPublicUrl(filePath);
      await supabase.from('candidates').update({ video_link: urlData.publicUrl }).eq('id_ld', videoUploadingCandidate);
      handleCandidateUpdate(videoUploadingCandidate, { video_link: urlData.publicUrl });
      setNewVideoCandidates((prev) => [...prev, videoUploadingCandidate]);
    } catch (err) {
      console.error('Upload error:', err);
      alert(`Upload lỗi: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (videoInputRef.current) videoInputRef.current.value = '';
      setVideoUploadingCandidate(null);
    }
  };

  const handleVideoViewed = useCallback((candidateId: string) => {
    setNewVideoCandidates((prev) => prev.filter((id) => id !== candidateId));
  }, []);

  const totalPassed = candidates.filter((c) => c.interview_status === 'Passed').length;
  const totalFailed = candidates.filter((c) => c.interview_status === 'Failed').length;

  const agentItems = agents.map((a) => ({ key: a.id, label: a.short_name || a.full_name || a.id }));
  const orderItems = orders.map((o) => ({ key: o.id, label: o.id, sub: o.company_name || '' }));

  return (
    <div className="p-4 pb-24 space-y-4">
      {playingVideo && (
        <VideoPlayer url={playingVideo} onClose={() => setPlayingVideo(null)} />
      )}

      <input type="file" accept="video/*" ref={videoInputRef} onChange={handleVideoChange} className="hidden" />

      <div className="flex items-center gap-3 pt-1">
        <div className="flex-1">
          <h1 className="text-lg font-bold text-slate-800">Ứng viên</h1>
          <p className="text-xs text-gray-400">{candidates.length} ứng viên · {totalPassed} passed · {totalFailed} failed</p>
        </div>
      </div>

      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm theo tên, passport, ID..."
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`text-xs px-3 py-1.5 rounded-full font-medium whitespace-nowrap transition-colors min-h-[36px] ${
              statusFilter === f.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <SearchDropdown
          placeholder="Tất cả Agent"
          items={agentItems}
          selectedKey={agentFilter}
          onSelect={setAgentFilter}
        />
        <SearchDropdown
          placeholder="Tất cả Đơn hàng"
          items={orderItems}
          selectedKey={orderFilter}
          onSelect={setOrderFilter}
        />
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[...Array(5)].map((_, i) => <div key={i} className="h-48 bg-gray-200 rounded-2xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-300 text-4xl mb-3">🧑‍💼</p>
          <p className="text-gray-500 text-sm">{search || statusFilter !== 'all' || agentFilter !== 'all' || orderFilter !== 'all' ? 'Không tìm thấy kết quả' : 'Chưa có ứng viên nào'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => {
            const ag = c.agent_id ? (agentMap.get(c.agent_id) ?? null) : null;
            const ord = c.order_id ? (orderMap.get(c.order_id) ?? null) : null;
            return (
              <CandidateCard
                key={c.id_ld}
                candidate={c}
                orderId={c.order_id || ''}
                onVideoUploadClick={handleVideoUploadClick}
                onCandidateUpdate={handleCandidateUpdate}
                onStatusChange={handleStatusChange}
                isVideoUploading={videoUploadingCandidate === c.id_ld}
                currentStatus={c.interview_status}
                useDropdown={true}
                orderInfo={ord ? { id: ord.id, company_name: ord.company_name, job_type: ord.job_type } : undefined}
                agentInfo={ag ? { short_name: ag.short_name, full_name: ag.full_name } : undefined}
                isNewVideo={newVideoCandidates.includes(c.id_ld)}
                onVideoViewed={() => handleVideoViewed(c.id_ld)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
