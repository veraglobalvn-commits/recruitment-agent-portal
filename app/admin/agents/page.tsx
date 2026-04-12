'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import AddAgentModal from '@/components/admin/AddAgentModal';

type RoleFilter = 'all' | 'agent' | 'admin';

interface AgentRow {
  id: string;
  full_name: string | null;
  short_name: string | null;
  role: string | null;
  totalOrders: number;
  totalCandidates: number;
  passed: number;
  target: number;
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
      <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

function RolePill({ role }: { role: string | null }) {
  if (role === 'admin') return <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">Admin</span>;
  return <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">Agent</span>;
}

const ROLE_FILTERS: { key: RoleFilter; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'agent', label: 'Agent' },
  { key: 'admin', label: 'Admin' },
];

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [filtered, setFiltered] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [agentsRes, ordersRes, candidatesRes] = await Promise.all([
        supabase.from('agents').select('id, full_name, short_name, role'),
        supabase.from('orders').select('id, agent_ids, total_labor'),
        supabase.from('candidates').select('id_ld, agent_id, interview_status'),
      ]);

      if (agentsRes.error) throw new Error(`agents: ${agentsRes.error.message}`);

      const agentsRaw = agentsRes.data || [];
      const orders = ordersRes.data || [];
      const candidates = candidatesRes.data || [];

      const rows: AgentRow[] = agentsRaw.map((ag: any) => {
        const agCands = candidates.filter((c: any) => c.agent_id === ag.id);
        const passed = agCands.filter((c: any) => c.interview_status === 'Passed').length;
        const agOrders = orders.filter((o: any) => (o.agent_ids || []).includes(ag.id));
        const target = agOrders.reduce((s: number, o: any) => s + (o.total_labor || 0), 0);
        return {
          id: ag.id,
          full_name: ag.full_name,
          short_name: ag.short_name,
          role: ag.role,
          totalOrders: agOrders.length,
          totalCandidates: agCands.length,
          passed,
          target,
        };
      });

      setAgents(rows);
    } catch (error) {
      console.error('Error loading agents:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(
      agents.filter((a) => {
        const matchSearch =
          (a.full_name ?? '').toLowerCase().includes(q) ||
          (a.short_name ?? '').toLowerCase().includes(q);
        const matchRole = roleFilter === 'all' || a.role === roleFilter;
        return matchSearch && matchRole;
      }),
    );
  }, [search, roleFilter, agents]);

  const agentCount = agents.filter((a) => a.role !== 'admin').length;
  const adminCount = agents.filter((a) => a.role === 'admin').length;

  return (
    <div className="p-4 pb-24 space-y-4">
      <div className="flex items-center gap-3 pt-1">
        <div className="flex-1">
          <h1 className="text-lg font-bold text-slate-800">Người dùng</h1>
          <p className="text-xs text-gray-400">{agentCount} agent · {adminCount} admin</p>
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
          placeholder="Tìm theo tên..."
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {ROLE_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setRoleFilter(f.key)}
            className={`text-xs px-3 py-1.5 rounded-full font-medium whitespace-nowrap transition-colors min-h-[36px] ${
              roleFilter === f.key
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
          <p className="text-gray-300 text-4xl mb-3">👥</p>
          <p className="text-gray-500 text-sm">{search || roleFilter !== 'all' ? 'Không tìm thấy kết quả' : 'Chưa có người dùng nào'}</p>
        </div>
      ) : (
        <>
          <div className="md:hidden space-y-3">
            {filtered.map((ag) => (
              <Link
                key={ag.id}
                href={`/admin/agents/${ag.id}`}
                className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow active:scale-[0.99]"
              >
                <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${ag.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                  {(ag.short_name || ag.full_name || '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-semibold text-sm text-slate-800 truncate">{ag.short_name || ag.full_name}</p>
                    <RolePill role={ag.role} />
                  </div>
                  <p className="text-xs text-gray-400">{ag.totalCandidates} ứng viên · {ag.passed} passed</p>
                  <div className="mt-1.5">
                    <ProgressBar value={ag.passed} max={ag.target} />
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className="text-sm font-bold text-slate-700">{ag.passed}</span>
                  <span className="text-xs text-gray-400">/{ag.target}</span>
                </div>
              </Link>
            ))}
          </div>

          <div className="hidden md:block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Tên', 'Vai trò', 'Đơn hàng', 'Ứng viên', 'Passed', 'Chỉ tiêu', 'Tiến độ', ''].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((ag) => (
                  <tr key={ag.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${ag.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                          {(ag.short_name || ag.full_name || '?')[0].toUpperCase()}
                        </div>
                        <Link href={`/admin/agents/${ag.id}`} className="font-medium text-slate-800 hover:text-blue-600 text-sm">
                          {ag.short_name || ag.full_name}
                        </Link>
                      </div>
                    </td>
                    <td className="px-4 py-3"><RolePill role={ag.role} /></td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-700">{ag.totalOrders}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">{ag.totalCandidates}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-green-600">{ag.passed}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">{ag.target}</td>
                    <td className="px-4 py-3 w-32">
                      <ProgressBar value={ag.passed} max={ag.target} />
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/agents/${ag.id}`} className="text-xs text-blue-600 hover:underline font-medium">Xem →</Link>
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
