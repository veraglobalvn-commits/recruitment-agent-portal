'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { fmtVND, fmtVndShort, fmtUSD } from '@/lib/formatters';
import type { OrderPayment } from '@/lib/types';

interface DebtRow {
  order_id: string;
  company_name: string | null;
  total_fee_vn: number | null;
  total_paid_company: number;
  total_fee_bd: number | null;
  total_paid_agent: number;
}

const COMPANY_PAYMENT_TYPES: Record<string, string> = {
  dat_coc: 'Đặt cọc',
  nghiem_thu_ld: 'Nghiệm thu LĐ',
  nghiem_thu_trc_wp: 'Nghiệm thu trước WP',
  khac: 'Khác',
};

const AGENT_PAYMENT_TYPES: Record<string, string> = {
  dat_coc: 'Đặt cọc',
  tat_toan_phi: 'Tất toán phí',
};

function PctPill({ pct }: { pct: number }) {
  if (pct >= 100) return <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Đã đủ</span>;
  if (pct > 0) return <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">{pct}%</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">Chưa TT</span>;
}

function StatCard({ label, value, sub, valueColor }: { label: string; value: string; sub?: string; valueColor?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-base font-bold truncate ${valueColor ?? 'text-slate-800'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function DebtPage() {
  const [rows, setRows] = useState<DebtRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hideComplete, setHideComplete] = useState(false);
  const [adminUser, setAdminUser] = useState<{ id: string; name: string } | null>(null);

  const [selectedOrder, setSelectedOrder] = useState<{ id: string; company_name: string | null } | null>(null);
  const [orderPayments, setOrderPayments] = useState<OrderPayment[]>([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'company' | 'agent'>('company');

  const [addingParty, setAddingParty] = useState<'company' | 'agent' | null>(null);
  const [editingPayment, setEditingPayment] = useState<OrderPayment | null>(null);
  const [paymentForm, setPaymentForm] = useState<Partial<OrderPayment & { currency: 'VND' | 'USD' }>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user.id) {
        const { data: ud } = await supabase.from('users').select('id, full_name').eq('supabase_uid', session.user.id).maybeSingle();
        if (ud) setAdminUser({ id: ud.id, name: ud.full_name || ud.id });
      }

      const [ordersRes, paymentsRes] = await Promise.all([
        supabase.from('orders')
          .select('id, company_name, total_fee_vn, total_fee_bd')
          .neq('status', 'Hoàn thành')
          .order('created_at', { ascending: false }),
        supabase.from('order_payments').select('*'),
      ]);

      const orders = ordersRes.data ?? [];
      const payments = (paymentsRes.data ?? []) as OrderPayment[];

      const result: DebtRow[] = orders.map(o => {
        const ops = payments.filter(p => p.order_id === o.id);
        return {
          order_id: o.id,
          company_name: o.company_name,
          total_fee_vn: o.total_fee_vn ? Number(o.total_fee_vn) : null,
          total_paid_company: ops.filter(p => p.payment_party === 'company' && p.currency === 'VND').reduce((s, p) => s + Number(p.amount), 0),
          total_fee_bd: o.total_fee_bd ? Number(o.total_fee_bd) : null,
          total_paid_agent: ops.filter(p => p.payment_party === 'agent').reduce((s, p) => s + Number(p.amount), 0),
        };
      });

      setRows(result);
    } catch {
      // keep empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openPaymentModal = async (orderId: string, companyName: string | null) => {
    setSelectedOrder({ id: orderId, company_name: companyName });
    setActiveTab('company');
    setAddingParty(null);
    setEditingPayment(null);
    setPaymentForm({});
    setModalLoading(true);
    const { data } = await supabase.from('order_payments').select('*').eq('order_id', orderId).order('created_at');
    setOrderPayments((data ?? []) as OrderPayment[]);
    setModalLoading(false);
  };

  const closeModal = () => {
    setSelectedOrder(null);
    setOrderPayments([]);
    setAddingParty(null);
    setEditingPayment(null);
    setPaymentForm({});
  };

  const startEdit = (p: OrderPayment) => {
    setEditingPayment(p);
    setAddingParty(null);
    setPaymentForm({
      payment_type: p.payment_type,
      amount: p.amount,
      currency: p.currency,
      payment_date: p.payment_date ?? '',
      note: p.note ?? '',
    });
  };

  const handleAddPayment = async () => {
    if (!paymentForm.amount || !paymentForm.payment_type || !addingParty || !selectedOrder) return;
    setSaving(true);
    try {
      const payload = {
        order_id: selectedOrder.id,
        payment_party: addingParty,
        payment_type: paymentForm.payment_type,
        agent_id: paymentForm.agent_id ?? null,
        handover_id: null,
        amount: Number(paymentForm.amount),
        currency: paymentForm.currency ?? 'VND',
        payment_date: paymentForm.payment_date || null,
        note: paymentForm.note || null,
      };
      const { data: newPayment, error } = await supabase.from('order_payments').insert(payload).select().single();
      if (error) throw error;

      setOrderPayments(ps => [...ps, newPayment as OrderPayment]);

      if (addingParty === 'company' && adminUser) {
        await supabase.from('finance_transactions').insert({
          type: 'income',
          amount: Number(paymentForm.amount),
          category_name: 'Phí dịch vụ',
          description: `Thu phí - ${selectedOrder.id} - ${selectedOrder.company_name || ''}`,
          date: paymentForm.payment_date || new Date().toISOString().slice(0, 10),
          user_id: adminUser.id,
          user_name: adminUser.name,
          order_payment_id: (newPayment as OrderPayment).id,
        });
      }

      setRows(rs => rs.map(r => {
        if (r.order_id !== selectedOrder.id) return r;
        return addingParty === 'company'
          ? { ...r, total_paid_company: r.total_paid_company + Number(paymentForm.amount) }
          : { ...r, total_paid_agent: r.total_paid_agent + Number(paymentForm.amount) };
      }));

      setAddingParty(null);
      setPaymentForm({});
    } catch (err) {
      alert(`Lỗi: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleEditPayment = async () => {
    if (!editingPayment || !paymentForm.amount || !paymentForm.payment_type) return;
    setSaving(true);
    try {
      const updates = {
        payment_type: paymentForm.payment_type,
        amount: Number(paymentForm.amount),
        currency: paymentForm.currency ?? editingPayment.currency,
        payment_date: paymentForm.payment_date || null,
        note: paymentForm.note || null,
      };
      const { error } = await supabase.from('order_payments').update(updates).eq('id', editingPayment.id);
      if (error) throw error;

      const updated = { ...editingPayment, ...updates };
      setOrderPayments(ps => ps.map(p => p.id === editingPayment.id ? updated : p));

      const diff = Number(paymentForm.amount) - editingPayment.amount;
      if (diff !== 0 && selectedOrder) {
        setRows(rs => rs.map(r => {
          if (r.order_id !== selectedOrder.id) return r;
          return editingPayment.payment_party === 'company'
            ? { ...r, total_paid_company: r.total_paid_company + diff }
            : { ...r, total_paid_agent: r.total_paid_agent + diff };
        }));
      }

      setEditingPayment(null);
      setPaymentForm({});
    } catch (err) {
      alert(`Lỗi: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePayment = async (payment: OrderPayment) => {
    if (!confirm('Xoá khoản thanh toán này?')) return;
    const { error } = await supabase.from('order_payments').delete().eq('id', payment.id);
    if (error) { alert(`Lỗi: ${error.message}`); return; }

    await supabase.from('finance_transactions').delete().eq('order_payment_id', payment.id);

    setOrderPayments(ps => ps.filter(p => p.id !== payment.id));
    if (selectedOrder) {
      setRows(rs => rs.map(r => {
        if (r.order_id !== selectedOrder.id) return r;
        return payment.payment_party === 'company'
          ? { ...r, total_paid_company: Math.max(0, r.total_paid_company - payment.amount) }
          : { ...r, total_paid_agent: Math.max(0, r.total_paid_agent - payment.amount) };
      }));
    }
  };

  const totalFeeVN = rows.reduce((s, r) => s + (r.total_fee_vn ?? 0) * 1.08, 0);
  const totalPaidVN = rows.reduce((s, r) => s + r.total_paid_company, 0);
  const remainingVN = totalFeeVN - totalPaidVN;

  const totalFeeBD = rows.reduce((s, r) => s + (r.total_fee_bd ?? 0), 0);
  const totalPaidBD = rows.reduce((s, r) => s + r.total_paid_agent, 0);
  const remainingBD = totalFeeBD - totalPaidBD;

  const displayed = hideComplete
    ? rows.filter(r => {
        const feeAfterVat = (r.total_fee_vn ?? 0) * 1.08;
        const pct = feeAfterVat > 0 ? Math.round((r.total_paid_company / feeAfterVat) * 100) : 0;
        return pct < 100;
      })
    : rows;

  const tabPayments = orderPayments.filter(p => p.payment_party === activeTab);
  const typeMap = activeTab === 'company' ? COMPANY_PAYMENT_TYPES : AGENT_PAYMENT_TYPES;

  return (
    <div className="p-4 pb-24 space-y-4">
      <div className="flex items-center gap-3 pt-1">
        <div className="flex-1">
          <h1 className="text-lg font-bold text-slate-800">Quản lý công nợ</h1>
          <p className="text-xs text-gray-400">{rows.length} đơn hàng đang hoạt động</p>
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={hideComplete} onChange={e => setHideComplete(e.target.checked)} className="rounded text-blue-600" />
          Ẩn đơn đã đủ
        </label>
      </div>

      {/* Summary */}
      {!loading && rows.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Công nợ công ty VN</p>
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Tổng phí (sau VAT)" value={fmtVndShort(totalFeeVN) + ' ₫'} />
            <StatCard label="Đã thu" value={fmtVndShort(totalPaidVN) + ' ₫'} valueColor="text-green-600" />
            <StatCard label="Còn phải thu" value={fmtVndShort(remainingVN) + ' ₫'} sub={remainingVN > 0 ? 'Chưa thu đủ' : 'Đã thu đủ'} valueColor={remainingVN > 0 ? 'text-red-600' : 'text-green-600'} />
          </div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mt-1">Công nợ Agent</p>
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Tổng phí Agent" value={'$' + fmtUSD(totalFeeBD)} />
            <StatCard label="Đã trả" value={'$' + fmtUSD(totalPaidBD)} />
            <StatCard label="Còn lại" value={'$' + fmtUSD(remainingBD)} sub={remainingBD > 0 ? 'Chưa trả đủ' : 'Đã trả đủ'} />
          </div>
        </div>
      )}

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
              const feeAfterVat = (r.total_fee_vn ?? 0) * 1.08;
              const companyPct = feeAfterVat > 0 ? Math.round((r.total_paid_company / feeAfterVat) * 100) : 0;
              const remaining = feeAfterVat > 0 ? Math.max(0, feeAfterVat - r.total_paid_company) : null;
              return (
                <div key={r.order_id} className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
                  <div className="flex justify-between items-start mb-1.5 gap-2">
                    <Link href={`/admin/orders/${encodeURIComponent(r.order_id)}`} className="font-semibold text-sm text-blue-600 truncate hover:underline">{r.order_id}</Link>
                    <PctPill pct={companyPct} />
                  </div>
                  <p className="text-xs text-gray-600 mb-2">{r.company_name || '—'}</p>
                  <div className="text-xs text-gray-500 space-y-0.5 mb-3">
                    <div className="flex justify-between">
                      <span>Phí VN (sau VAT 8%):</span>
                      <span className="font-semibold text-slate-700">{feeAfterVat > 0 ? fmtVND(feeAfterVat) + ' ₫' : '—'}</span>
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
                  <button
                    onClick={() => openPaymentModal(r.order_id, r.company_name)}
                    className="w-full text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 py-2 rounded-lg font-medium transition-colors min-h-[36px]"
                  >
                    Quản lý thanh toán
                  </button>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['Mã đơn', 'Công ty', 'Phí VN (sau VAT)', 'Đã thu', 'Còn phải thu', 'TT %', 'Phí Agent (USD)', 'Đã trả Agent', ''].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {displayed.map(r => {
                    const feeAfterVat = (r.total_fee_vn ?? 0) * 1.08;
                    const companyPct = feeAfterVat > 0 ? Math.round((r.total_paid_company / feeAfterVat) * 100) : 0;
                    const remaining = feeAfterVat > 0 ? Math.max(0, feeAfterVat - r.total_paid_company) : null;
                    return (
                      <tr key={r.order_id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <Link href={`/admin/orders/${encodeURIComponent(r.order_id)}`} className="font-medium text-blue-600 hover:underline text-xs whitespace-nowrap">{r.order_id}</Link>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-700">{r.company_name || '—'}</td>
                        <td className="px-4 py-3 text-xs font-semibold text-slate-700">{feeAfterVat > 0 ? fmtVND(feeAfterVat) : '—'}</td>
                        <td className="px-4 py-3 text-xs font-semibold text-green-600">{fmtVND(r.total_paid_company)}</td>
                        <td className="px-4 py-3 text-xs font-semibold text-red-600">{remaining !== null && remaining > 0 ? fmtVND(remaining) : <span className="text-green-600">Đủ</span>}</td>
                        <td className="px-4 py-3"><PctPill pct={companyPct} /></td>
                        <td className="px-4 py-3 text-xs text-gray-600">{r.total_fee_bd ? fmtUSD(r.total_fee_bd) : '—'}</td>
                        <td className="px-4 py-3 text-xs font-semibold text-blue-600">{fmtUSD(r.total_paid_agent)}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => openPaymentModal(r.order_id, r.company_name)}
                            className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap"
                          >
                            Thanh toán
                          </button>
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

      {/* Payment Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100 flex-shrink-0">
              <div>
                <p className="text-sm font-bold text-slate-800">Chi tiết thanh toán</p>
                <p className="text-xs text-blue-600 font-medium">{selectedOrder.id}</p>
                <p className="text-xs text-gray-500">{selectedOrder.company_name || '—'}</p>
              </div>
              <button onClick={closeModal} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 text-lg">✕</button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-100 flex-shrink-0">
              {(['company', 'agent'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => { setActiveTab(tab); setAddingParty(null); setEditingPayment(null); setPaymentForm({}); }}
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors ${activeTab === tab ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  {tab === 'company' ? 'Phí VN' : 'Phí Agent BD'}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
              {modalLoading ? (
                <div className="space-y-2 animate-pulse">
                  {[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded-xl" />)}
                </div>
              ) : tabPayments.length === 0 && !addingParty ? (
                <p className="text-sm text-gray-400 text-center py-4">Chưa có khoản thanh toán nào</p>
              ) : (
                <div className="space-y-2">
                  {tabPayments.map(p => (
                    editingPayment?.id === p.id ? (
                      <div key={p.id} className="bg-blue-50 rounded-xl p-3 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Loại</label>
                            <select
                              value={paymentForm.payment_type ?? ''}
                              onChange={e => setPaymentForm(f => ({ ...f, payment_type: e.target.value }))}
                              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                            >
                              {Object.entries(typeMap).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Số tiền</label>
                            <input
                              type="number"
                              value={paymentForm.amount ?? ''}
                              onChange={e => setPaymentForm(f => ({ ...f, amount: Number(e.target.value) }))}
                              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                            />
                          </div>
                        </div>
                        {activeTab === 'agent' && (
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Tiền tệ</label>
                            <select
                              value={paymentForm.currency ?? 'VND'}
                              onChange={e => setPaymentForm(f => ({ ...f, currency: e.target.value as 'VND' | 'USD' }))}
                              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                            >
                              <option value="VND">VND</option>
                              <option value="USD">USD</option>
                            </select>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Ngày</label>
                            <input
                              type="date"
                              value={paymentForm.payment_date ?? ''}
                              onChange={e => setPaymentForm(f => ({ ...f, payment_date: e.target.value }))}
                              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Ghi chú</label>
                            <input
                              type="text"
                              value={paymentForm.note ?? ''}
                              onChange={e => setPaymentForm(f => ({ ...f, note: e.target.value }))}
                              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={handleEditPayment} disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2 rounded-lg disabled:opacity-50">
                            {saving ? 'Đang lưu...' : 'Lưu'}
                          </button>
                          <button onClick={() => { setEditingPayment(null); setPaymentForm({}); }} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold py-2 rounded-lg">Huỷ</button>
                        </div>
                      </div>
                    ) : (
                      <div key={p.id} className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-slate-700">{COMPANY_PAYMENT_TYPES[p.payment_type] || AGENT_PAYMENT_TYPES[p.payment_type] || p.payment_type}</span>
                            {p.currency === 'USD' && <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded-full">USD</span>}
                          </div>
                          <p className="text-xs text-green-600 font-bold">
                            {p.currency === 'USD' ? '$' + fmtUSD(p.amount) : fmtVND(p.amount) + ' ₫'}
                          </p>
                          {(p.payment_date || p.note) && (
                            <p className="text-xs text-gray-400 truncate">{p.payment_date} {p.note}</p>
                          )}
                        </div>
                        <button onClick={() => startEdit(p)} className="text-gray-400 hover:text-blue-600 p-1.5 rounded-lg hover:bg-blue-50 transition-colors">✏️</button>
                        <button onClick={() => handleDeletePayment(p)} className="text-gray-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors">🗑️</button>
                      </div>
                    )
                  ))}
                </div>
              )}

              {/* Add form */}
              {addingParty === activeTab && (
                <div className="bg-green-50 rounded-xl p-3 space-y-2">
                  <p className="text-xs font-semibold text-green-700">Thêm khoản {activeTab === 'company' ? 'thu VN' : 'trả Agent'}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Loại *</label>
                      <select
                        value={paymentForm.payment_type ?? ''}
                        onChange={e => setPaymentForm(f => ({ ...f, payment_type: e.target.value }))}
                        className="w-full text-xs border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                      >
                        <option value="">-- Chọn loại --</option>
                        {Object.entries(typeMap).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Số tiền *</label>
                      <input
                        type="number"
                        min="1"
                        placeholder="0"
                        value={paymentForm.amount ?? ''}
                        onChange={e => setPaymentForm(f => ({ ...f, amount: Number(e.target.value) }))}
                        className="w-full text-xs border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                    </div>
                  </div>
                  {activeTab === 'agent' && (
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Tiền tệ</label>
                      <select
                        value={paymentForm.currency ?? 'USD'}
                        onChange={e => setPaymentForm(f => ({ ...f, currency: e.target.value as 'VND' | 'USD' }))}
                        className="w-full text-xs border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                      >
                        <option value="USD">USD</option>
                        <option value="VND">VND</option>
                      </select>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Ngày TT</label>
                      <input
                        type="date"
                        value={paymentForm.payment_date ?? ''}
                        onChange={e => setPaymentForm(f => ({ ...f, payment_date: e.target.value }))}
                        className="w-full text-xs border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Ghi chú</label>
                      <input
                        type="text"
                        value={paymentForm.note ?? ''}
                        onChange={e => setPaymentForm(f => ({ ...f, note: e.target.value }))}
                        className="w-full text-xs border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleAddPayment}
                      disabled={saving || !paymentForm.amount || !paymentForm.payment_type}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold py-2 rounded-lg disabled:opacity-50 min-h-[36px]"
                    >
                      {saving ? 'Đang lưu...' : 'Lưu'}
                    </button>
                    <button onClick={() => { setAddingParty(null); setPaymentForm({}); }} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold py-2 rounded-lg">Huỷ</button>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 pb-5 pt-3 border-t border-gray-100 flex-shrink-0">
              {!addingParty && !editingPayment && (
                <button
                  onClick={() => { setAddingParty(activeTab); setPaymentForm(activeTab === 'agent' ? { currency: 'USD' } : { currency: 'VND' }); setEditingPayment(null); }}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-3 rounded-xl min-h-[44px]"
                >
                  + Thêm khoản {activeTab === 'company' ? 'thu VN' : 'trả Agent BD'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
