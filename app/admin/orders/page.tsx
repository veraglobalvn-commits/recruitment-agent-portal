'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { AdminOrder, AgentOption } from '@/lib/types';
import Link from 'next/link';
import AddOrderModal from '@/components/admin/AddOrderModal';

type StatusFilter = 'all' | 'Đang tuyển' | 'Đã tuyển đủ';

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
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${c[label] ?? 'bg-gray-100 text-gray-600'}`}>{label}</span>;
}

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'Đang tuyển', label: 'Đang tuyển' },
  { key: 'Đã tuyển đủ', label: 'Đã tuyển đủ' },
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

  const agentMap = new Map(agents.map((a) => [a.id, a]));

  const load = useCallback(async () => {
    setLoading(true);
    const [ordRes, agRes] = await Promise.all([
      supabase.from('orders').select('*'),
      supabase.from('agents').select('id, full_name, short_name').neq('role', 'admin'),
    ]);
    const orders = (ordRes.data ?? []) as AdminOrder[];
    orders.sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return dateB - dateA;
    });
    setOrders(orders);
    setAgents((agRes.data ?? []) as AgentOption[]);
    setLoading(false);
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

  const activeCount = orders.filter((o) => o.status !== 'Đã tuyển đủ').length;

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
            className={`text-xs px-3 py-1.5 rounded-full font-medium whitespace-nowrap transition-colors min-h-[36px] ${
              statusFilter === f.key
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
                <Link
                  key={o.id}
                  href={`/admin/orders/${encodeURIComponent(o.id)}`}
                  className="block p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow active:scale-[0.99]"
                >
                  <div className="flex justify-between items-start mb-1.5 gap-2">
                    <span className="font-semibold text-sm text-blue-600 truncate">{o.id}</span>
                    <StatusPill label={o.status} />
                  </div>
                  <p className="text-xs text-gray-700 font-medium truncate">{o.company_name || '—'}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{o.job_type || '—'} {o.salary_usd ? `· $${o.salary_usd}` : ''}</p>
                  <div className="flex flex-wrap items-center justify-between mt-2 gap-x-2 gap-y-1.5">
                    <div className="text-xs text-gray-500 flex items-center gap-1">
                      <span className="font-semibold text-slate-700">{o.total_labor ?? 0} LĐ</span>
                      {missing > 0 && <span className="text-red-400">(-{missing})</span>}
                    </div>
                    <div className="flex items-center flex-wrap gap-1.5">
                      <StatusPill label={o.payment_status_vn} />
                      {agentNames.map((ag) => (
                        <span key={ag.id} className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full whitespace-nowrap">{ag.short_name || ag.full_name}</span>
                      ))}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="hidden md:block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['Mã đơn', 'Công ty', 'Vị trí', 'LĐ', 'Còn thiếu', 'Lương', 'Trạng thái', 'TT VN', 'Agent', ''].map((h) => (
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
                      <tr key={o.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <Link href={`/admin/orders/${encodeURIComponent(o.id)}`} className="font-medium text-blue-600 hover:underline text-xs whitespace-nowrap">
                            {o.id}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <Link href={o.company_id ? `/admin/companies/${o.company_id}` : '#'} className="text-xs text-gray-700 hover:text-blue-600 hover:underline">
                            {o.company_name || '—'}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">{o.job_type || '—'}</td>
                        <td className="px-4 py-3 text-xs font-semibold text-slate-700">{o.total_labor ?? '—'}</td>
                        <td className="px-4 py-3 text-xs text-red-400">{o.labor_missing ?? '—'}</td>
                        <td className="px-4 py-3 text-xs text-gray-600">{o.salary_usd ? `$${o.salary_usd}` : '—'}</td>
                        <td className="px-4 py-3"><StatusPill label={o.status} /></td>
                        <td className="px-4 py-3"><StatusPill label={o.payment_status_vn} /></td>
                        <td className="px-4 py-3 text-xs text-gray-600">
                          {agentNames.length > 0 ? agentNames.map((ag) => ag.short_name || ag.full_name).join(', ') : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/admin/orders/${encodeURIComponent(o.id)}`} className="text-xs text-blue-600 hover:underline font-medium">
                            Xem →
                          </Link>
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
