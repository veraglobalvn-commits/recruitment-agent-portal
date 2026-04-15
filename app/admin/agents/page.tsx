'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import AddAgentModal from '@/components/admin/AddAgentModal';

interface AgentRow {
  id: string;
  full_name: string | null;
  short_name: string | null;
  labor_percentage: number | null;
  totalOrders: number;
  totalCandidates: number;
  passed: number;
  target: number;
}

function isMissingAgent(ag: AgentRow) {
  return !ag.labor_percentage || ag.labor_percentage <= 0;
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
      <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [filtered, setFiltered] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [agentsRes, ordersRes, candidatesRes] = await Promise.all([
        supabase.from('agents').select('id, full_name, short_name, labor_percentage').order('created_at', { ascending: false }),
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
          labor_percentage: ag.labor_percentage,
          totalOrders: agOrders.length,
          totalCandidates: agCands.length,
          passed,
          target,
        };
      });

      setAgents(rows);
      setFiltered(rows);
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
      agents.filter(
        (a) =>
          (a.full_name ?? '').toLowerCase().includes(q) ||
          (a.short_name ?? '').toLowerCase().includes(q),
      ),
    );
  }, [search, agents]);

  return (
    <div className="p-4 pb-24 space-y-4">
      <div className="flex items-center gap-3 pt-1">
        <div className="flex-1">
          <h1 className="text-lg font-bold text-slate-800">Agent BD</h1>
          <p className="text-xs text-gray-400">{agents.length} agent</p>
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
          placeholder="Tìm theo tên agent..."
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]"
        />
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[...Array(5)].map((_, i) => <div key={i} className="h-24 bg-gray-200 rounded-2xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-300 text-4xl mb-3">👥</p>
          <p className="text-gray-500 text-sm">{search ? 'Không tìm thấy kết quả' : 'Chưa có agent nào'}</p>
        </div>
      ) : (
        <>
          <div className="md:hidden space-y-3">
            {filtered.map((ag) => (
              <Link
                key={ag.id}
                href={`/admin/agents/${ag.id}`}
                className={`flex items-center gap-3 p-4 bg-white rounded-2xl border shadow-sm hover:shadow-md transition-shadow active:scale-[0.99] ${isMissingAgent(ag) ? 'border-red-200 bg-red-50/30' : 'border-gray-100'}`}
              >
                <div className="w-11 h-11 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
                  {(ag.short_name || ag.full_name || '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-slate-800 truncate">{ag.short_name || ag.full_name}</p>
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
                  {['Agent', 'Đơn hàng', 'Ứng viên', 'Passed', 'Chỉ tiêu', 'Tiến độ', ''].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((ag) => (
                  <tr key={ag.id} className={`transition-colors ${isMissingAgent(ag) ? 'bg-red-50/30 hover:bg-red-50/50' : 'hover:bg-gray-50'}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs flex-shrink-0">
                          {(ag.short_name || ag.full_name || '?')[0].toUpperCase()}
                        </div>
                        <Link href={`/admin/agents/${ag.id}`} className="font-medium text-slate-800 hover:text-blue-600 text-sm">
                          {ag.short_name || ag.full_name}
                        </Link>
                      </div>
                    </td>
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
