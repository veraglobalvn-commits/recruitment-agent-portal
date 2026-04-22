'use client';
import StatusPill from '@/components/ui/StatusPill';
import { fmtVndShort } from '@/lib/formatters';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { fetchActiveAgents } from '@/lib/query-helpers';
import type { AdminOrder, AgentOption } from '@/lib/types';
import Link from 'next/link';
import AddOrderModal from '@/components/admin/AddOrderModal';

type StatusFilter = 'all' | 'Not Started' | 'On-going' | 'Finished' | 'Cancelled';

function recruitStatusInfo(o: AdminOrder): { label: string; cls: string } {
  if (o.status === 'Cancelled') return { label: 'Cancelled', cls: 'bg-red-100 text-red-600' };
  if (o.status === 'Finished' || o.labor_missing === 0) return { label: 'Đã tuyển xong', cls: 'bg-green-100 text-green-700' };
  if (o.status === 'Not Started') return { label: 'Chưa tuyển', cls: 'bg-gray-100 text-gray-600' };
  return { label: 'Đang tuyển', cls: 'bg-amber-100 text-amber-700' };
}

function isMissingOrder(o: AdminOrder) {
  return !o.job_type || !o.service_fee_per_person || !o.agent_ids?.length;
}

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'Not Started', label: 'Chưa tuyển' },
  { key: 'On-going', label: 'Đang tuyển' },
  { key: 'Finished', label: 'Đã tuyển xong' },
  { key: 'Cancelled', label: 'Cancelled' },
];

export default function OrdersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [filtered, setFiltered] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showModal, setShowModal] = useState(false);
  const [prefillCompanyId, setPrefillCompanyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copyShareLink = (orderId: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/share/${encodeURIComponent(orderId)}`);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    setCopiedId(orderId);
    copyTimerRef.current = setTimeout(() => setCopiedId(null), 2000);
  };

  const agentMap = new Map(agents.map((a) => [a.id, a]));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ordRes, activeAgents] = await Promise.all([
        supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(200),
        fetchActiveAgents(),
      ]);
      setOrders((ordRes.data ?? []) as AdminOrder[]);
      setAgents(activeAgents);
    } catch {
      // data stays empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(
      orders.filter((o) => {
        const matchSearch =
          o.id.toLowerCase().includes(q) ||
          (o.company_name ?? '').toLowerCase().includes(q) ||
          (o.job_type ?? '').toLowerCase().includes(q);
        const matchStatus = statusFilter === 'all' || o.status === statusFilter;
        return matchSearch && matchStatus;
      }),
    );
  }, [search, statusFilter, orders]);

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      const cid = searchParams.get('companyId');
      setPrefillCompanyId(cid);
      setShowModal(true);
      const url = new URL(window.location.href);
      url.searchParams.delete('new');
      url.searchParams.delete('companyId');
      window.history.replaceState({}, '', url.pathname);
    }
  }, [searchParams]);

  const activeCount = orders.filter((o) => o.status === 'On-going' || o.status === 'Not Started').length;

  return (
    <div className="p-4 pb-24 space-y-4">
      <div className="flex items-center gap-3 pt-1">
        <div className="flex-1">
          <h1 className="text-lg font-bold text-slate-800">Đơn hàng</h1>
          <p className="text-xs text-gray-400">{orders.length} đơn · {activeCount} đang tuyển</p>
        </div>
        <button
          onClick={() => { setPrefillCompanyId(null); setShowModal(true); }}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm min-h-[44px] flex items-center gap-1.5 transition-colors"
        >
          + Thêm
        </button>
      </div>

      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm theo mã đơn, công ty, vị trí..."
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`text-xs px-3 py-1.5 rounded-full font-medium whitespace-nowrap transition-colors min-h-[36px] ${statusFilter === f.key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[...Array(5)].map((_, i) => <div key={i} className="h-24 bg-gray-200 rounded-2xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-300 text-4xl mb-3">📋</p>
          <p className="text-gray-500 text-sm">{search || statusFilter !== 'all' ? 'Không tìm thấy kết quả' : 'Chưa có đơn hàng nào'}</p>
        </div>
      ) : (
        <>
          <div className="md:hidden space-y-3">
            {filtered.map((o) => {
              const agentNames = (o.agent_ids || [])
                .map((id) => agentMap.get(id))
                .filter((a): a is AgentOption => a !== undefined);
              const missing = o.labor_missing ?? 0;
              return (
                <div key={o.id} className={`p-4 bg-white rounded-2xl border shadow-sm ${isMissingOrder(o) ? 'border-red-200 bg-red-50/30' : 'border-gray-100'}`}>
                  <Link href={`/admin/orders/${encodeURIComponent(o.id)}`} className="block">
                    <div className="flex justify-between items-start mb-1.5 gap-2">
                      <span className="font-semibold text-sm text-blue-600 truncate uppercase">{o.id}</span>
                      {(() => { const r = recruitStatusInfo(o); return <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${r.cls}`}>{r.label}</span>; })()}
                    </div>
                    <p className="text-xs text-gray-700 font-medium truncate uppercase">{o.company_name || '—'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{o.job_type || '—'} {o.salary_usd ? `· $${o.salary_usd}` : ''}</p>
                    <div className="flex flex-wrap items-center justify-between mt-2 gap-x-2 gap-y-1.5">
                      <div className="text-xs text-gray-500 flex items-center gap-1">
                        <span className="font-semibold text-slate-700">{o.total_labor ?? 0} LĐ</span>
                        {missing > 0 && <span className="text-red-400">(-{missing})</span>}
                        {o.total_fee_vn ? <span className="text-blue-600 font-semibold ml-1">{fmtVndShort((o.total_fee_vn as number) * 1.08)} ₫</span> : null}
                      </div>
                      <div className="flex items-center flex-wrap gap-1.5">
                        <StatusPill label={o.payment_status_vn} />
                        {agentNames.map((ag) => (
                          <span key={ag.id} className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full whitespace-nowrap">{ag.short_name || ag.full_name}</span>
                        ))}
                      </div>
                    </div>
                  </Link>
                  <div className="mt-2 pt-2 border-t border-gray-50 flex items-center gap-3">
                    <a href={`/share/${encodeURIComponent(o.id)}`} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-500 hover:text-blue-600 font-medium flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/></svg>
                      Xem
                    </a>
                    <button onClick={() => copyShareLink(o.id)} className="text-xs text-gray-400 hover:text-blue-600 transition-colors flex items-center gap-1">
                      {copiedId === o.id
                        ? <span className="text-green-600 font-medium flex items-center gap-1"><svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>Đã copy</span>
                        : <><svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z"/></svg>Share</>
                      }
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hidden md:block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['Mã đơn', 'Công ty', 'Vị trí', 'LĐ', 'Còn thiếu', 'Lương', 'Phí VN (sau VAT)', 'Trạng thái', 'TT VN', ''].map((h) => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((o) => {
                    const agentNames = (o.agent_ids || [])
                      .map((id) => agentMap.get(id))
                      .filter((a): a is AgentOption => a !== undefined);
                    return (
                      <tr key={o.id} className={`transition-colors ${isMissingOrder(o) ? 'bg-red-50/30 hover:bg-red-50/50' : 'hover:bg-gray-50'}`}>
                        <td className="px-4 py-3">
                          <Link href={`/admin/orders/${encodeURIComponent(o.id)}`} className="font-medium text-blue-600 hover:underline text-xs whitespace-nowrap uppercase">
                            {o.id}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <Link href={o.company_id ? `/admin/companies/${o.company_id}` : '#'} className="text-xs text-gray-700 hover:text-blue-600 hover:underline uppercase">
                            {o.company_name || '—'}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">{o.job_type || '—'}</td>
                        <td className="px-4 py-3 text-xs font-semibold text-slate-700">{o.total_labor ?? '—'}</td>
                        <td className="px-4 py-3 text-xs text-red-400">{o.labor_missing ?? '—'}</td>
                        <td className="px-4 py-3 text-xs text-gray-600">{o.salary_usd ? `$${o.salary_usd}` : '—'}</td>
                        <td className="px-4 py-3 text-xs font-semibold text-blue-600 whitespace-nowrap">{o.total_fee_vn ? fmtVndShort((o.total_fee_vn as number) * 1.08) + ' ₫' : '—'}</td>
                        <td className="px-4 py-3">{(() => { const r = recruitStatusInfo(o); return <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${r.cls}`}>{r.label}</span>; })()}</td>
                        <td className="px-4 py-3"><StatusPill label={o.payment_status_vn} /></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 whitespace-nowrap">
                            <Link href={`/admin/orders/${encodeURIComponent(o.id)}`} className="text-xs text-blue-600 hover:underline font-medium">
                              Xem →
                            </Link>
                            <a href={`/share/${encodeURIComponent(o.id)}`} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-500 hover:text-blue-600 flex items-center gap-0.5" title="Xem trang share">
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/></svg>
                              <span className="text-xs">Xem</span>
                            </a>
                            <button onClick={() => copyShareLink(o.id)} className="text-xs text-gray-400 hover:text-blue-600 transition-colors flex items-center gap-0.5" title="Copy link share">
                              {copiedId === o.id
                                ? <span className="text-green-600"><svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg></span>
                                : <><svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z"/></svg><span className="text-xs">Share</span></>
                              }
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {showModal && (
        <AddOrderModal
          onClose={() => { setShowModal(false); setPrefillCompanyId(null); }}
          onSaved={(order, andView) => {
            setShowModal(false);
            setPrefillCompanyId(null);
            if (andView) {
              router.push(`/admin/orders/${encodeURIComponent(order.id)}`);
            } else {
              load();
            }
          }}
          prefillCompanyId={prefillCompanyId}
        />
      )}
    </div>
  );
}
