'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { AdminOrder, AgentOption } from '@/lib/types';
import { fmtUSD } from '@/lib/formatters';

interface AddOrderModalProps {
  onClose: () => void;
  onSaved: (order: AdminOrder, andView: boolean) => void;
  prefillCompanyId?: string | null;
}

interface CompanyOption {
  id: string;
  company_name: string;
  short_name: string | null;
}

export default function AddOrderModal({ onClose, onSaved, prefillCompanyId }: AddOrderModalProps) {
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [companySearch, setCompanySearch] = useState('');
  const [selectedCompany, setSelectedCompany] = useState<CompanyOption | null>(null);
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
  const [defaultFeeVnd, setDefaultFeeVnd] = useState('18270000');
  const [defaultFeeUsd, setDefaultFeeUsd] = useState('1500');
  const [form, setForm] = useState({
    job_type: '',
    total_labor: '',
    salary_usd: '',
    agent_ids: [] as string[],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    const load = async () => {
      const [compRes, agRes, policyRes] = await Promise.all([
        supabase.from('companies').select('id, company_name, short_name').is('deleted_at', null).order('company_name'),
        supabase.from('users').select('id, full_name, short_name').neq('role', 'admin').order('full_name'),
        supabase.from('policy_settings').select('key, value').in('key', ['default_fee_vnd', 'default_fee_usd']),
      ]);
      setCompanies((compRes.data ?? []) as CompanyOption[]);
      setAgents((agRes.data ?? []) as AgentOption[]);
      if (policyRes.data) {
        const map = Object.fromEntries((policyRes.data as { key: string; value: string }[]).map(r => [r.key, r.value]));
        if (map.default_fee_vnd) setDefaultFeeVnd(map.default_fee_vnd);
        if (map.default_fee_usd) setDefaultFeeUsd(map.default_fee_usd);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (prefillCompanyId) {
      const found = companies.find((c) => c.id === prefillCompanyId);
      if (found) setSelectedCompany(found);
    }
  }, [prefillCompanyId, companies]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowCompanyDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredCompanies = companySearch
    ? companies.filter(
        (c) =>
          c.company_name.toLowerCase().includes(companySearch.toLowerCase()) ||
          (c.short_name ?? '').toLowerCase().includes(companySearch.toLowerCase()),
      )
    : companies;

  const handleCompanySelect = (c: CompanyOption) => {
    setSelectedCompany(c);
    setCompanySearch('');
    setShowCompanyDropdown(false);
  };

  const generateOrderId = async (shortName: string | null): Promise<string> => {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = String(now.getFullYear());
    const prefix = shortName
      ? `${shortName.toUpperCase().replace(/ /g, '_')}_${mm}${yyyy}`
      : `ORD_${mm}${yyyy}`;
    const { data } = await supabase.from('orders').select('id').like('id', `${prefix}%`);
    if (!data || data.length === 0) return prefix;
    const maxNum = data.reduce((max: number, row: { id: string }) => {
      const suffix = row.id.slice(prefix.length);
      const num = suffix ? parseInt(suffix.replace(/^_/, ''), 10) || 1 : 1;
      return Math.max(max, num);
    }, 1);
    return `${prefix}_${maxNum + 1}`;
  };

  const handleSave = async (andView = false) => {
    if (!selectedCompany) { setError('Chọn công ty là bắt buộc'); return; }
    if (!form.job_type.trim()) { setError('Vị trí công việc là bắt buộc'); return; }
    setSaving(true);
    setError(null);
    try {
      const orderId = await generateOrderId(selectedCompany.short_name);
      const laborCount = form.total_labor ? parseInt(form.total_labor) : null;
      const feeVnd = parseFloat(defaultFeeVnd) || null;
      const feeUsd = parseFloat(defaultFeeUsd) || null;
      const payload = {
        id: orderId,
        company_id: selectedCompany.id,
        company_name: selectedCompany.company_name,
        job_type: form.job_type.trim(),
        total_labor: laborCount,
        salary_usd: form.salary_usd ? parseFloat(form.salary_usd) : null,
        agent_ids: form.agent_ids.length > 0 ? form.agent_ids : null,
        status: 'Đang tuyển',
        payment_status_vn: 'Chưa TT',
        labor_missing: laborCount,
        service_fee_per_person: feeVnd,
        service_fee_bd_per_person: feeUsd,
        total_fee_vn: laborCount && feeVnd ? laborCount * feeVnd : null,
        total_fee_bd: laborCount && feeUsd ? laborCount * feeUsd : null,
      };
      const { data, error: dbErr } = await supabase
        .from('orders')
        .insert(payload)
        .select()
        .single();
      if (dbErr) throw new Error(dbErr.message);
      if (form.agent_ids.length > 0 && data?.id) {
        const oaRows = form.agent_ids.map((aid) => ({
          order_id: data.id,
          agent_id: aid,
          assigned_labor_number: 0,
          assigned_date: new Date().toISOString(),
        }));
        await supabase.from('order_agents').insert(oaRows);
      }
      onSaved(data as AdminOrder, andView);
    } catch (err) {
      setError(`Lưu thất bại: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-3 sm:hidden flex-shrink-0" />

        <div className="flex justify-between items-center px-5 pt-4 pb-3 flex-shrink-0">
          <h2 className="text-base font-bold text-gray-800">Thêm đơn hàng</h2>
          <button onClick={onClose} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-gray-700 text-xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>
          )}

          <div ref={dropdownRef} className="relative">
            <label className="block text-xs text-gray-500 mb-1">Công ty <span className="text-red-500">*</span></label>
            {selectedCompany ? (
              <div className="flex items-center gap-2 p-2.5 bg-blue-50 border border-blue-200 rounded-lg min-h-[44px]">
                <span className="flex-1 text-sm font-medium text-blue-800 truncate">{selectedCompany.company_name}</span>
                <button
                  onClick={() => setSelectedCompany(null)}
                  className="text-blue-400 hover:text-blue-700 text-xs min-h-[32px] min-w-[32px] flex items-center justify-center"
                >
                  ✕
                </button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  value={companySearch}
                  onChange={(e) => { setCompanySearch(e.target.value); setShowCompanyDropdown(true); }}
                  onFocus={() => setShowCompanyDropdown(true)}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                {showCompanyDropdown && filteredCompanies.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto z-10">
                    {filteredCompanies.slice(0, 20).map((c) => (
                      <button
                        key={c.id}
                        onClick={() => handleCompanySelect(c)}
                        className="w-full text-left px-3 py-2.5 text-sm hover:bg-blue-50 transition-colors min-h-[44px] flex items-center gap-2"
                      >
                        <span className="text-gray-800 truncate">{c.company_name}</span>
                        {c.short_name && <span className="text-xs text-gray-400 ml-auto flex-shrink-0">{c.short_name}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Vị trí / Loại lao động <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.job_type}
              onChange={(e) => set('job_type', e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Số lao động</label>
              <input
                type="number"
                value={form.total_labor}
                onChange={(e) => set('total_labor', e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Lương (USD)</label>
              <input
                type="text"
                inputMode="numeric"
                value={form.salary_usd ? fmtUSD(parseFloat(form.salary_usd) || 0) : ''}
                onChange={(e) => set('salary_usd', e.target.value.replace(/,/g, ''))}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Agent phụ trách</label>
            <div className="max-h-36 overflow-y-auto space-y-1 border border-gray-200 rounded-lg p-2">
              {agents.map((ag) => (
                <label key={ag.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.agent_ids.includes(ag.id)}
                    onChange={() => {
                      setForm((f) => ({
                        ...f,
                        agent_ids: f.agent_ids.includes(ag.id)
                          ? f.agent_ids.filter((x) => x !== ag.id)
                          : [...f.agent_ids, ag.id],
                      }));
                    }}
                    className="rounded text-blue-600 focus:ring-blue-400"
                  />
                  <span className="text-sm text-gray-700">{ag.short_name || ag.full_name}</span>
                </label>
              ))}
            </div>
            {form.agent_ids.length === 0 && (
              <p className="text-xs text-gray-400 mt-1">Chưa chọn agent nào</p>
            )}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-2 flex-shrink-0">
          <button
            onClick={() => handleSave(false)}
            disabled={saving}
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 rounded-xl text-sm disabled:opacity-50 min-h-[44px]"
          >
            {saving ? 'Đang lưu...' : 'Lưu'}
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={saving}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-50 min-h-[44px]"
          >
            Lưu & xem →
          </button>
        </div>
      </div>
    </div>
  );
}
