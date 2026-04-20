'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

async function generateOrderId(shortName: string | null): Promise<string> {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = String(now.getFullYear());
  const prefix = shortName
    ? `${shortName.toUpperCase().replace(/ /g, '_')}_${mm}${yyyy}`
    : `ORD_${mm}${yyyy}`;
  const { data } = await supabase.from('orders').select('id').like('id', `${prefix}%`);
  if (!data || data.length === 0) return prefix;
  const maxNum = (data as { id: string }[]).reduce((max, row) => {
    const suffix = row.id.slice(prefix.length);
    const num = suffix ? parseInt(suffix.replace(/^_/, ''), 10) || 1 : 1;
    return Math.max(max, num);
  }, 1);
  return `${prefix}_${maxNum + 1}`;
}

export default function QuickAddOrderModal({
  companyId,
  companyName,
  companyShortName,
  onClose,
  onSaved,
}: {
  companyId: string;
  companyName: string;
  companyShortName: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({ job_type: 'Lao động phổ thông', total_labor: '', status: 'Đang tuyển' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!form.job_type.trim()) { setError('Vị trí công việc là bắt buộc'); return; }
    setSaving(true);
    const orderId = await generateOrderId(companyShortName);
    const { error: dbErr } = await supabase.from('orders').insert({
      id: orderId,
      company_id: companyId,
      company_name: companyName,
      job_type: form.job_type.trim(),
      total_labor: form.total_labor ? parseInt(form.total_labor) : null,
      status: form.status,
    });
    setSaving(false);
    if (dbErr) { setError(dbErr.message); return; }
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-xl p-5 pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4 sm:hidden" />
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-slate-800">Thêm đơn hàng</h3>
          <button onClick={onClose} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 text-xl">✕</button>
        </div>
        <p className="text-xs text-gray-500 mb-4">Công ty: <strong>{companyName}</strong></p>
        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Vị trí / Loại lao động <span className="text-red-500">*</span></label>
            <input type="text" value={form.job_type} onChange={(e) => setForm(f => ({ ...f, job_type: e.target.value }))}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Số lao động cần</label>
            <input type="number" value={form.total_labor} onChange={(e) => setForm(f => ({ ...f, total_labor: e.target.value }))}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-50 min-h-[44px]">
          {saving ? 'Đang lưu...' : 'Lưu đơn hàng'}
        </button>
      </div>
    </div>
  );
}
