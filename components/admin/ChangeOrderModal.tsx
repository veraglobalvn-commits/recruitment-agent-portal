'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface ChangeOrderOption {
  id: string;
  company_name: string | null;
  job_type: string | null;
}

interface ChangeOrderModalProps {
  open: boolean;
  orders: ChangeOrderOption[];
  selectedCount: number;
  excludedOrderIds?: string[];
  onClose: () => void;
  onMoved: (targetOrderId: string, warnings: string[]) => void;
  candidateIds: string[];
}

export default function ChangeOrderModal({
  open,
  orders,
  selectedCount,
  excludedOrderIds = [],
  onClose,
  onMoved,
  candidateIds,
}: ChangeOrderModalProps) {
  const [targetOrderId, setTargetOrderId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const excludedSet = useMemo(() => new Set(excludedOrderIds), [excludedOrderIds]);
  const availableOrders = useMemo(
    () => orders.filter((order) => !excludedSet.has(order.id)),
    [orders, excludedSet],
  );

  useEffect(() => {
    if (!open) return;
    setTargetOrderId('');
    setError(null);
  }, [open]);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!targetOrderId || candidateIds.length === 0) return;
    setSubmitting(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Chưa đăng nhập');

      const res = await fetch('/api/admin/candidates/change-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          candidate_ids: candidateIds,
          target_order_id: targetOrderId,
        }),
      });
      const json = await res.json() as { error?: string; warnings?: string[] };

      if (!res.ok) {
        throw new Error(json.error ?? `Lỗi ${res.status}`);
      }

      onMoved(targetOrderId, json.warnings ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-xl p-5 pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4 sm:hidden" />
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="font-bold text-slate-800">Chuyển đơn hàng</h3>
            <p className="text-xs text-gray-500 mt-1">Đã chọn {selectedCount} ứng viên</p>
          </div>
          <button onClick={onClose} className="text-gray-400 text-xl min-h-[44px] min-w-[44px] flex items-center justify-center">✕</button>
        </div>

        <label className="block text-xs text-gray-500 mb-1">Đơn hàng đích</label>
        <select
          value={targetOrderId}
          onChange={(e) => setTargetOrderId(e.target.value)}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px] bg-white"
        >
          <option value="">Chọn đơn hàng</option>
          {availableOrders.map((order) => (
            <option key={order.id} value={order.id}>
              {order.id}{order.company_name ? ` - ${order.company_name}` : ''}{order.job_type ? ` - ${order.job_type}` : ''}
            </option>
          ))}
        </select>

        {availableOrders.length === 0 && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-3">
            Không có đơn hàng đích phù hợp.
          </p>
        )}

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mt-3">
            {error}
          </p>
        )}

        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            className="flex-1 border border-gray-200 text-gray-600 font-semibold py-3 rounded-xl text-sm min-h-[44px]"
          >
            Huỷ
          </button>
          <button
            onClick={handleSubmit}
            disabled={!targetOrderId || submitting || candidateIds.length === 0}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm min-h-[44px]"
          >
            {submitting ? 'Đang chuyển...' : 'Chuyển'}
          </button>
        </div>
      </div>
    </div>
  );
}
