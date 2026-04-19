'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { fmtVND, fmtUSD } from '@/lib/formatters';
import { fetchActiveAgencies } from '@/lib/query-helpers';

interface AgentRow {
  id: string;
  company_name: string | null;
  labor_percentage: number | null;
}

export default function PolicyPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // Payment policy
  const [feeVnd, setFeeVnd] = useState('');
  const [feeUsd, setFeeUsd] = useState('');
  const [prevFeeVnd, setPrevFeeVnd] = useState('');
  const [prevFeeUsd, setPrevFeeUsd] = useState('');

  // Agent labor ratios
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [agentPct, setAgentPct] = useState<Record<string, string>>({});
  const [prevAgentPct, setPrevAgentPct] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [policyRes, activeAgencies] = await Promise.all([
        supabase.from('policy_settings').select('key, value').in('key', ['default_fee_vnd', 'default_fee_usd']),
        fetchActiveAgencies<{ id: string; company_name: string | null; labor_percentage: number | null }>('id, company_name, labor_percentage'),
      ]);

      if (policyRes.data) {
        const map = Object.fromEntries((policyRes.data as { key: string; value: string }[]).map(r => [r.key, r.value]));
        setFeeVnd(map.default_fee_vnd ?? '18270000');
        setFeeUsd(map.default_fee_usd ?? '1500');
        setPrevFeeVnd(map.default_fee_vnd ?? '18270000');
        setPrevFeeUsd(map.default_fee_usd ?? '1500');
      }

      if (activeAgencies && activeAgencies.length > 0) {
        const rows = activeAgencies as AgentRow[];
        setAgents(rows);
        const pct = Object.fromEntries(rows.map(a => [a.id, String(a.labor_percentage ?? '')]));
        setAgentPct(pct);
        setPrevAgentPct(pct);
      }
    } catch {
      // data stays empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);

    // Upsert policy settings
    const upserts = [
      { key: 'default_fee_vnd', value: feeVnd.trim() || '18270000', updated_at: new Date().toISOString() },
      { key: 'default_fee_usd', value: feeUsd.trim() || '1500', updated_at: new Date().toISOString() },
    ];
    const { error: pErr } = await supabase.from('policy_settings').upsert(upserts, { onConflict: 'key' });
    if (pErr) { setSaving(false); setSaveMsg(`❌ ${pErr.message}`); return; }

    // Bulk update agent labor_percentage
    const agentUpdates = agents.map(a => ({
      id: a.id,
      labor_percentage: agentPct[a.id] ? parseInt(agentPct[a.id], 10) : null,
    }));
    for (const upd of agentUpdates) {
      const { error: aErr } = await supabase.from('agencies').update({ labor_percentage: upd.labor_percentage }).eq('id', upd.id);
      if (aErr) { setSaving(false); setSaveMsg(`❌ ${aErr.message}`); return; }
    }

    setPrevFeeVnd(feeVnd);
    setPrevFeeUsd(feeUsd);
    setPrevAgentPct({ ...agentPct });
    setSaving(false);
    setSaveMsg('✅ Đã lưu chính sách');
    setTimeout(() => setSaveMsg(null), 3000);
  };

  const inputCls = 'w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]';

  if (loading) {
    return (
      <div className="p-4 space-y-4 animate-pulse">
        <div className="h-10 bg-gray-200 rounded-xl" />
        <div className="h-40 bg-gray-200 rounded-2xl" />
        <div className="h-64 bg-gray-200 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="pb-24">
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800">Chính sách</p>
        </div>
        {saveMsg && <span className="text-xs font-medium text-green-600">{saveMsg}</span>}
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-xl text-sm font-semibold min-h-[44px] bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Đang lưu...' : 'Lưu chính sách'}
        </button>
      </div>

      <div className="p-4 space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-700">
          Thay đổi chính sách chỉ áp dụng cho các <strong>đơn hàng tạo mới</strong>. Đơn hàng đã tạo trước đó không bị ảnh hưởng.
        </div>

        {/* Chính sách thanh toán */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50">
            <h2 className="text-sm font-semibold text-slate-700">Chính sách thanh toán</h2>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Phí mặc định / lao động tại Việt Nam (VNĐ)</label>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  inputMode="numeric"
                  value={feeVnd ? fmtVND(parseFloat(feeVnd) || 0) : ''}
                  onChange={(e) => setFeeVnd(e.target.value.replace(/\./g, ''))}
                  className={inputCls + ' flex-1'}
                />
                <span className="text-xs text-gray-400 flex-shrink-0 whitespace-nowrap">
                  Hiện tại: {prevFeeVnd ? fmtVND(parseFloat(prevFeeVnd) || 0) + ' ₫' : '—'}
                </span>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Phí mặc định / lao động tại Bangladesh (USD)</label>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  inputMode="numeric"
                  value={feeUsd ? fmtUSD(parseFloat(feeUsd) || 0) : ''}
                  onChange={(e) => setFeeUsd(e.target.value.replace(/,/g, ''))}
                  className={inputCls + ' flex-1'}
                />
                <span className="text-xs text-gray-400 flex-shrink-0 whitespace-nowrap">
                  Hiện tại: ${prevFeeUsd ? fmtUSD(parseFloat(prevFeeUsd) || 0) : '—'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Tỷ trọng Agent */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50">
            <h2 className="text-sm font-semibold text-slate-700">Tỷ trọng lao động Agent ({agents.length})</h2>
          </div>
          {agents.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-8">Chưa có agent nào</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {agents.map((a) => {
                const displayName = a.company_name || a.id;
                return (
                  <div key={a.id} className="px-4 py-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold flex-shrink-0">
                      {displayName[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{displayName}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={agentPct[a.id] ?? ''}
                        onChange={(e) => setAgentPct(p => ({ ...p, [a.id]: e.target.value }))}
                        className="w-20 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 text-center"
                      />
                      <span className="text-sm text-gray-500">%</span>
                      <span className="text-xs text-gray-400 w-16 text-right">
                        Hiện: {prevAgentPct[a.id] || '—'}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
