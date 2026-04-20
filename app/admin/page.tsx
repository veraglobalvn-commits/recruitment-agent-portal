'use client';

import { useEffect, useState, useCallback } from 'react';
import StatusPill from '@/components/ui/StatusPill';
import ProgressBar from '@/components/ui/ProgressBar';
import { fmtVndShort } from '@/lib/formatters';
import { supabase } from '@/lib/supabase';
import { fetchActiveAgents } from '@/lib/query-helpers';
import Link from 'next/link';

// ── Types ──────────────────────────────────────────────
interface OrderStat {
  id: string;
  company_name: string | null;
  job_type: string | null;
  total_labor: number | null;
  labor_missing: number | null;
  status: string | null;
  total_fee_vn: number | null;
  payment_status_vn: string | null;
  legal_status: string | null;
  agent_ids: string[] | null;
}

interface AgentStat {
  id: string;
  full_name: string | null;
  short_name: string | null;
  passed: number;
  total_candidates: number;
  target: number;
}

interface DashboardData {
  orders: OrderStat[];
  agents: AgentStat[];
  totalRevenue: number;
  totalLaborTarget: number;
  totalPassed: number;
}

// ── Quick-Add FAB Modal ──────────────────────────────────
function QuickAddModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-xl p-6 pb-8 sm:pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-5 sm:hidden" />
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-bold text-gray-800">Thêm nhanh</h2>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-gray-700 text-xl"
          >
            ✕
          </button>
        </div>
        <div className="space-y-3">
          <Link
            href="/admin/companies?new=1"
            onClick={onClose}
            className="flex items-center gap-4 p-4 border-2 border-dashed border-gray-200 rounded-2xl hover:border-blue-400 hover:bg-blue-50 transition-all group min-h-[64px]"
          >
            <span className="text-3xl">🏭</span>
            <div>
              <p className="font-semibold text-gray-800 group-hover:text-blue-700">Thêm công ty VN</p>
              <p className="text-xs text-gray-500 mt-0.5">Quét ĐKKD hoặc nhập thủ công</p>
            </div>
          </Link>
          <Link
            href="/admin/orders?new=1"
            onClick={onClose}
            className="flex items-center gap-4 p-4 border-2 border-dashed border-gray-200 rounded-2xl hover:border-green-400 hover:bg-green-50 transition-all group min-h-[64px]"
          >
            <span className="text-3xl">📋</span>
            <div>
              <p className="font-semibold text-gray-800 group-hover:text-green-700">Thêm đơn tuyển dụng</p>
              <p className="text-xs text-gray-500 mt-0.5">Liên kết với công ty đã có</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ title, badge }: { title: string; badge?: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
      <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
      {badge && (
        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">{badge}</span>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────
export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFab, setShowFab] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ordersRes, candidatesRes, activeAgents, oaRes] = await Promise.all([
        supabase.from('orders').select('id,company_name,job_type,total_labor,labor_missing,status,total_fee_vn,payment_status_vn,legal_status,agent_ids'),
        supabase.from('candidates').select('id_ld,agent_id,order_id,interview_status'),
        fetchActiveAgents('id, full_name, short_name'),
        supabase.from('order_agents').select('agent_id,assigned_labor_number'),
      ]);

      const orders: OrderStat[] = (ordersRes.data || []) as OrderStat[];
      const candidates = candidatesRes.data || [];
      const agentsRaw = activeAgents || [];

      const oaTargetMap: Record<string, number> = {};
      (oaRes.data || []).forEach((oa: any) => {
        oaTargetMap[oa.agent_id] = (oaTargetMap[oa.agent_id] || 0) + (oa.assigned_labor_number || 0);
      });

      const agents: AgentStat[] = agentsRaw.map((ag: any) => {
        const agCands = candidates.filter((c: any) => c.agent_id === ag.id);
        const passed = agCands.filter((c: any) => c.interview_status === 'Passed').length;
        const target = oaTargetMap[ag.id] || 0;
        return { id: ag.id, full_name: ag.full_name, short_name: ag.short_name, total_candidates: agCands.length, passed, target };
      });

      const totalRevenue = orders.reduce((s, o) => s + (o.total_fee_vn || 0), 0);
      const totalLaborTarget = orders.reduce((s, o) => s + (o.total_labor || 0), 0);
      const totalPassed = candidates.filter((c: any) => c.interview_status === 'Passed').length;

      setData({ orders, agents, totalRevenue, totalLaborTarget, totalPassed });
      setLastUpdated(new Date());
    } catch {
      // data stays empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="p-4 space-y-4 animate-pulse">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-gray-200 rounded-2xl" />)}
        </div>
        <div className="h-48 bg-gray-200 rounded-2xl" />
        <div className="h-48 bg-gray-200 rounded-2xl" />
        <div className="h-64 bg-gray-200 rounded-2xl" />
      </div>
    );
  }

  if (!data) return null;

  const incompleteOrders = data.orders.filter((o) => o.status !== 'Đã tuyển đủ');
  const totalMissing = data.totalLaborTarget - data.totalPassed;

  return (
    <div className="p-4 pb-28 space-y-4">

      {/* Tiêu đề trang */}
      <div className="flex items-center justify-between pt-1">
        <h1 className="text-lg font-bold text-slate-800">Tổng quan</h1>
        {lastUpdated && (
          <button
            onClick={load}
            className="text-xs text-blue-500 hover:text-blue-700 min-h-[44px] px-2 flex items-center gap-1"
          >
            ↺ Làm mới
          </button>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Chỉ tiêu lao động', value: data.totalLaborTarget, sub: `${data.orders.length} đơn hàng`, color: 'text-slate-800' },
          { label: 'Đã trúng tuyển', value: data.totalPassed, sub: 'qua phỏng vấn', color: 'text-green-600' },
          { label: 'Còn thiếu', value: totalMissing, sub: 'để hoàn thành', color: 'text-red-500' },
          { label: 'Doanh thu', value: fmtVndShort(data.totalRevenue), sub: 'phí dịch vụ VN', color: 'text-blue-600', isStr: true },
        ].map(({ label, value, sub, color, isStr }) => (
          <div key={label} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p className="text-xs text-gray-500 leading-tight">{label}</p>
            <p className={`font-bold mt-1 ${color} ${isStr ? 'text-base' : 'text-2xl'}`}>{value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* 2 cột: tình hình đơn + agent */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Đơn hàng đang tuyển */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <SectionHeader title="Tình hình lao động" badge={`${incompleteOrders.length} đơn đang tuyển`} />
          {incompleteOrders.length === 0 ? (
            <p className="text-center text-gray-300 text-sm py-8">Tất cả đơn hàng đã hoàn thành 🎉</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {incompleteOrders.map((o) => {
                const done = (o.total_labor ?? 0) - (o.labor_missing ?? o.total_labor ?? 0);
                const target = o.total_labor ?? 0;
                return (
                  <div key={o.id} className="px-4 py-3">
                    <div className="flex justify-between items-start mb-2 gap-2">
                      <div className="min-w-0">
                        <Link
                          href={`/admin/orders/${encodeURIComponent(o.id)}`}
                          className="font-semibold text-sm text-slate-800 hover:text-blue-600 block truncate"
                        >
                          {o.id}
                        </Link>
                        <p className="text-xs text-gray-400 truncate">{o.company_name} · {o.job_type || '—'}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="text-sm font-bold text-slate-700">{done}/{target}</span>
                        <p className="text-xs text-red-400">còn {o.labor_missing ?? 0}</p>
                      </div>
                    </div>
                    <ProgressBar value={done} max={target} color="bg-green-500" />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Hoạt động agent */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-slate-700">Hoạt động Agent</h2>
            <Link href="/admin/agencies" className="text-xs text-blue-600 hover:underline font-medium">Xem tất cả →</Link>
          </div>
          {data.agents.length === 0 ? (
            <p className="text-center text-gray-300 text-sm py-8">Chưa có agent</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {data.agents.map((ag) => (
                <div key={ag.id} className="px-4 py-3">
                  <div className="flex justify-between items-center mb-2 gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/admin/agencies/${ag.id}`}
                        className="font-semibold text-sm text-slate-800 hover:text-blue-600 block truncate"
                      >
                        {ag.short_name || ag.full_name}
                      </Link>
                      <p className="text-xs text-gray-400">{ag.total_candidates} ứng viên</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="text-sm font-bold text-green-600">{ag.passed}</span>
                      <span className="text-xs text-gray-400">/{ag.target} chỉ tiêu</span>
                    </div>
                  </div>
                  <ProgressBar value={ag.passed} max={ag.target} color="bg-blue-500" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bảng đơn hàng — card trên mobile, table trên desktop */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <SectionHeader title="Tình hình tuyển dụng & thanh toán" />

        {/* Mobile: card list */}
        <div className="md:hidden divide-y divide-gray-50">
          {data.orders.map((o) => (
            <Link
              key={o.id}
              href={`/admin/orders/${encodeURIComponent(o.id)}`}
              className="block px-4 py-3 hover:bg-gray-50 active:bg-gray-100"
            >
              <div className="flex justify-between items-start mb-1 gap-2">
                <span className="font-semibold text-sm text-blue-600 truncate flex-1">{o.id}</span>
                <StatusPill label={o.status} />
              </div>
              <p className="text-xs text-gray-500 mb-2">{o.company_name || '—'} · {o.job_type || '—'}</p>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <p className="text-xs text-gray-400">Lao động</p>
                  <p className="text-sm font-bold text-slate-700">
                    {o.total_labor ?? '—'}
                    {o.labor_missing ? <span className="text-red-400 text-xs font-normal"> (-{o.labor_missing})</span> : null}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Phí DV</p>
                  <p className="text-sm font-bold text-slate-700">{fmtVndShort(o.total_fee_vn)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Thanh toán</p>
                  <StatusPill label={o.payment_status_vn} />
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Desktop: table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Mã đơn', 'Công ty', 'Vị trí', 'Lao động', 'Phí DV', 'Pháp lý', 'TT VN', 'Trạng thái'].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.orders.map((o) => (
                <tr key={o.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/admin/orders/${encodeURIComponent(o.id)}`} className="font-medium text-blue-600 hover:underline text-xs whitespace-nowrap">
                      {o.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-700 whitespace-nowrap">{o.company_name || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{o.job_type || '—'}</td>
                  <td className="px-4 py-3 text-xs">
                    <span className="font-semibold">{o.total_labor ?? '—'}</span>
                    {o.labor_missing ? <span className="text-red-400 ml-1">-{o.labor_missing}</span> : null}
                  </td>
                  <td className="px-4 py-3 text-xs font-semibold text-gray-700 whitespace-nowrap">{fmtVndShort(o.total_fee_vn)}</td>
                  <td className="px-4 py-3"><StatusPill label={o.legal_status} /></td>
                  <td className="px-4 py-3"><StatusPill label={o.payment_status_vn} /></td>
                  <td className="px-4 py-3"><StatusPill label={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* FAB */}
      <button
        onClick={() => setShowFab(true)}
        className="fixed bottom-6 right-5 w-14 h-14 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-full shadow-2xl flex items-center justify-center text-3xl transition-all z-40"
        aria-label="Thêm nhanh"
      >
        +
      </button>

      {showFab && <QuickAddModal onClose={() => setShowFab(false)} />}
    </div>
  );
}
