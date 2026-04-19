'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { fmtVND } from '@/lib/formatters';

interface DebtRow {
  order_id: string;
  company_name: string | null;
  total_fee_vn: number | null;
  total_paid_company: number;
  total_fee_bd: number | null;
  total_paid_agent: number;
}

function PctPill({ pct }: { pct: number }) {
  if (pct >= 100) return <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Đã đủ</span>;
  if (pct > 0) return <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">{pct}%</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">Chưa TT</span>;
}

export default function DebtPage() {
  const [rows, setRows] = useState<DebtRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hideComplete, setHideComplete] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ordersRes, paymentsRes] = await Promise.all([
        supabase.from('orders').select('id, company_name, total_fee_vn, total_fee_bd').order('created_at', { ascending: false }),
        supabase.from('order_payments').select('order_id, payment_party, currency, amount'),
      ]);

      const orders = (ordersRes.data ?? []) as { id: string; company_name: string | null; total_fee_vn: number | null; total_fee_bd: number | null }[];
      const payments = (paymentsRes.data ?? []) as { order_id: string; payment_party: string; currency: string; amount: number }[];

      const result: DebtRow[] = orders.map(o => {
        const orderPayments = payments.filter(p => p.order_id === o.id);
        return {
          order_id: o.id,
          company_name: o.company_name,
          total_fee_vn: o.total_fee_vn ? Number(o.total_fee_vn) : null,
          total_paid_company: orderPayments
            .filter(p => p.payment_party === 'company' && p.currency === 'VND')
            .reduce((s, p) => s + Number(p.amount), 0),
          total_fee_bd: o.total_fee_bd ? Number(o.total_fee_bd) : null,
          total_paid_agent: orderPayments
            .filter(p => p.payment_party === 'agent')
            .reduce((s, p) => s + Number(p.amount), 0),
        };
      });

      setRows(result);
    } catch {
      // data stays empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const displayed = hideComplete
    ? rows.filter(r => {
        const companyPct = r.total_fee_vn ? Math.round((r.total_paid_company / r.total_fee_vn) * 100) : 0;
        return companyPct < 100;
      })
    : rows;

  return (
    <div className="p-4 pb-24 space-y-4">
      <div className="flex items-center gap-3 pt-1">
        <div className="flex-1">
          <h1 className="text-lg font-bold text-slate-800">Quản lý công nợ</h1>
          <p className="text-xs text-gray-400">{displayed.length} đơn hàng</p>
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={hideComplete}
            onChange={e => setHideComplete(e.target.checked)}
            className="rounded text-blue-600"
          />
          Ẩn đơn đã thanh toán đủ
        </label>
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-gray-200 rounded-2xl" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-300 text-4xl mb-3">📋</p>
          <p className="text-gray-500 text-sm">Chưa có đơn hàng nào</p>
        </div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-300 text-4xl mb-3">✅</p>
          <p className="text-gray-500 text-sm">Tất cả đơn hàng đã thanh toán đủ</p>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {displayed.map(r => {
              const companyPct = r.total_fee_vn ? Math.round((r.total_paid_company / r.total_fee_vn) * 100) : 0;
              const remaining = r.total_fee_vn ? Math.max(0, r.total_fee_vn - r.total_paid_company) : null;
              return (
                <Link
                  key={r.order_id}
                  href={`/admin/orders/${encodeURIComponent(r.order_id)}`}
                  className="block p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow active:scale-[0.99]"
                >
                  <div className="flex justify-between items-start mb-1.5 gap-2">
                    <span className="font-semibold text-sm text-blue-600 truncate">{r.order_id}</span>
                    <PctPill pct={companyPct} />
                  </div>
                  <p className="text-xs text-gray-600 mb-2">{r.company_name || '—'}</p>
                  <div className="text-xs text-gray-500 space-y-0.5">
                    <div className="flex justify-between">
                      <span>Tổng phí VN:</span>
                      <span className="font-semibold text-slate-700">{r.total_fee_vn ? fmtVND(r.total_fee_vn) + ' ₫' : '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Đã thu:</span>
                      <span className="font-semibold text-green-600">{fmtVND(r.total_paid_company)} ₫</span>
                    </div>
                    {remaining !== null && remaining > 0 && (
                      <div className="flex justify-between">
                        <span>Còn thiếu:</span>
                        <span className="font-semibold text-red-600">{fmtVND(remaining)} ₫</span>
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['Mã đơn', 'Công ty', 'Tổng phí VN', 'Đã thu', 'Còn thiếu', 'TT %', 'Phí Agent', 'Đã trả Agent'].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {displayed.map(r => {
                    const companyPct = r.total_fee_vn ? Math.round((r.total_paid_company / r.total_fee_vn) * 100) : 0;
                    const remaining = r.total_fee_vn ? Math.max(0, r.total_fee_vn - r.total_paid_company) : null;
                    return (
                      <tr key={r.order_id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <Link href={`/admin/orders/${encodeURIComponent(r.order_id)}`} className="font-medium text-blue-600 hover:underline text-xs whitespace-nowrap">
                            {r.order_id}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-700">{r.company_name || '—'}</td>
                        <td className="px-4 py-3 text-xs font-semibold text-slate-700">{r.total_fee_vn ? fmtVND(r.total_fee_vn) : '—'}</td>
                        <td className="px-4 py-3 text-xs font-semibold text-green-600">{fmtVND(r.total_paid_company)}</td>
                        <td className="px-4 py-3 text-xs font-semibold text-red-600">{remaining !== null ? fmtVND(remaining) : '—'}</td>
                        <td className="px-4 py-3"><PctPill pct={companyPct} /></td>
                        <td className="px-4 py-3 text-xs text-gray-600">{r.total_fee_bd ? fmtVND(r.total_fee_bd) : '—'}</td>
                        <td className="px-4 py-3 text-xs font-semibold text-blue-600">{fmtVND(r.total_paid_agent)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
