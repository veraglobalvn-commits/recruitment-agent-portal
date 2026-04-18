'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import AddAgentModal from '@/components/admin/AddAgentModal';

interface AgencyRow {
  id: string;
  company_name: string | null;
  legal_rep: string | null;
  labor_percentage: number | null;
  status: string | null;
  memberCount: number;
  totalOrders: number;
  totalCandidates: number;
  passed: number;
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
      <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function AgenciesPage() {
  const [agencies, setAgencies] = useState<AgencyRow[]>([]);
  const [filtered, setFiltered] = useState<AgencyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

      const [agRes, usersRes, ordersRes, candidatesRes, oaRes] = await Promise.all([
        fetch('/api/admin/agencies', { headers }).then(r => r.json()),
        supabase.from('users').select('id, agency_id, role').neq('role', 'admin'),
        supabase.from('orders').select('id, agent_ids, total_labor'),
        supabase.from('candidates').select('id_ld, agent_id, interview_status'),
        supabase.from('order_agents').select('agent_id, assigned_labor_number'),
      ]);

      const agenciesRaw = agRes.agencies || [];
      const users = usersRes.data || [];
      const orders = ordersRes.data || [];
      const candidates = candidatesRes.data || [];

      const oaTargetMap: Record<string, number> = {};
      (oaRes.data || []).forEach((oa: any) => {
        oaTargetMap[oa.agent_id] = (oaTargetMap[oa.agent_id] || 0) + (oa.assigned_labor_number || 0);
      });

      const memberCountMap: Record<string, number> = {};
      users.forEach((u: any) => {
        if (u.agency_id) memberCountMap[u.agency_id] = (memberCountMap[u.agency_id] || 0) + 1;
      });

      const agencyUserIds: Record<string, string[]> = {};
      users.forEach((u: any) => {
        const aid = u.agency_id;
        if (aid) {
          if (!agencyUserIds[aid]) agencyUserIds[aid] = [];
          agencyUserIds[aid].push(u.id);
        }
      });

      const rows: AgencyRow[] = agenciesRaw.map((ag: any) => {
        const memberIds = agencyUserIds[ag.id] || [];
        const agCands = candidates.filter((c: any) => memberIds.includes(c.agent_id));
        const passed = agCands.filter((c: any) => c.interview_status === 'Passed').length;
        const agOrders = orders.filter((o: any) =>
          (o.agent_ids || []).some((aid: string) => memberIds.includes(aid))
        );
        return {
          id: ag.id,
          company_name: ag.company_name,
          legal_rep: ag.legal_rep,
          labor_percentage: ag.labor_percentage,
          status: ag.status,
          memberCount: (memberCountMap[ag.id] || 0) + 1,
          totalOrders: agOrders.length,
          totalCandidates: agCands.length,
          passed,
        };
      });

      setAgencies(rows);
      setFiltered(rows);
    } catch (error) {
      console.error('Error loading agencies:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(
      agencies.filter(
        (a) =>
          (a.company_name ?? '').toLowerCase().includes(q) ||
          a.id.toLowerCase().includes(q) ||
          (a.legal_rep ?? '').toLowerCase().includes(q),
      ),
    );
  }, [search, agencies]);

  return (
    <div className="p-4 pb-24 space-y-4">
      <div className="flex items-center gap-3 pt-1">
        <div className="flex-1">
          <h1 className="text-lg font-bold text-slate-800">Đại lý</h1>
          <p className="text-xs text-gray-400">{agencies.length} agency</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
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
          placeholder="Tìm theo tên công ty, ID..."
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]"
        />
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[...Array(5)].map((_, i) => <div key={i} className="h-24 bg-gray-200 rounded-2xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-300 text-4xl mb-3">🏢</p>
          <p className="text-gray-500 text-sm">{search ? 'Không tìm thấy kết quả' : 'Chưa có agency nào'}</p>
        </div>
      ) : (
        <>
          <div className="md:hidden space-y-3">
            {filtered.map((ag) => (
              <Link
                key={ag.id}
                href={`/admin/agencies/${ag.id}`}
                className={`flex items-center gap-3 p-4 bg-white rounded-2xl border shadow-sm hover:shadow-md transition-shadow active:scale-[0.99] ${ag.status === 'inactive' ? 'border-red-200 opacity-60' : 'border-gray-100'}`}
              >
                <div className="w-11 h-11 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
                  {(ag.company_name || ag.id)[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-slate-800 truncate">{ag.company_name || ag.id}</p>
                  <p className="text-xs text-gray-400">{ag.memberCount} members · {ag.totalCandidates} ứng viên · {ag.passed} passed</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className="text-sm font-bold text-green-600">{ag.passed}</span>
                  <span className="text-xs text-gray-400"> UV</span>
                </div>
              </Link>
            ))}
          </div>

          <div className="hidden md:block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Agency', 'Members', 'Đơn hàng', 'Ứng viên', 'Passed', 'Trạng thái', ''].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((ag) => (
                  <tr key={ag.id} className={`transition-colors ${ag.status === 'inactive' ? 'opacity-60' : 'hover:bg-gray-50'}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs flex-shrink-0">
                          {(ag.company_name || ag.id)[0].toUpperCase()}
                        </div>
                        <div>
                          <Link href={`/admin/agencies/${ag.id}`} className="font-medium text-slate-800 hover:text-blue-600 text-sm">
                            {ag.company_name || ag.id}
                          </Link>
                          <p className="text-xs text-gray-400">{ag.legal_rep || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-700">{ag.memberCount}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">{ag.totalOrders}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">{ag.totalCandidates}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-green-600">{ag.passed}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ag.status === 'inactive' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'}`}>
                        {ag.status === 'inactive' ? 'Ngừng HD' : 'Hoạt động'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/agencies/${ag.id}`} className="text-xs text-blue-600 hover:underline font-medium">Xem →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showModal && (
        <AddAgentModal
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            load();
          }}
        />
      )}
    </div>
  );
}
