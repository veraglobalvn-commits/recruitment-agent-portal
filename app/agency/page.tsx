'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { Agency } from '@/lib/types';

export default function AgencyPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [agency, setAgency] = useState<Agency | null>(null);
  const [form, setForm] = useState({
    company_name: '',
    company_address: '',
    legal_rep: '',
    legal_rep_title: '',
    license_no: '',
    labor_percentage: '',
  });

  const loadAgency = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/'); return; }

      const { data: userData } = await supabase
        .from('users')
        .select('id, role, agency_id')
        .eq('supabase_uid', session.user.id)
        .maybeSingle();

      if (!userData || userData.role !== 'agent') {
        router.replace('/');
        return;
      }

      const agencyId = userData.agency_id || userData.id;
      const { data: agencyData, error } = await supabase
        .from('agencies')
        .select('*')
        .eq('id', agencyId)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!agencyData) {
        setLoading(false);
        return;
      }

      setAgency(agencyData);
      setForm({
        company_name: agencyData.company_name || '',
        company_address: agencyData.company_address || '',
        legal_rep: agencyData.legal_rep || '',
        legal_rep_title: agencyData.legal_rep_title || '',
        license_no: agencyData.license_no || '',
        labor_percentage: agencyData.labor_percentage?.toString() || '',
      });
    } catch {
      router.replace('/');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { loadAgency(); }, [loadAgency]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agency) return;
    setSaving(true);
    setMsg(null);
    try {
      const updates = {
        company_name: form.company_name.trim() || null,
        company_address: form.company_address.trim() || null,
        legal_rep: form.legal_rep.trim() || null,
        legal_rep_title: form.legal_rep_title.trim() || null,
        license_no: form.license_no.trim() || null,
        labor_percentage: form.labor_percentage ? parseFloat(form.labor_percentage) : null,
      };

      const { error } = await supabase.from('agencies').update(updates).eq('id', agency.id);
      if (error) throw new Error(error.message);
      setMsg('Saved successfully.');
    } catch (err) {
      setMsg(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!agency) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
          <button onClick={() => router.back()} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-500 hover:text-gray-700">←</button>
          <h1 className="text-base font-bold text-slate-800 flex-1">Agency Info</h1>
        </header>
        <div className="flex items-center justify-center py-20 text-gray-400 text-sm">No agency found. Contact admin.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => router.back()} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-500 hover:text-gray-700">
          ←
        </button>
        <h1 className="text-base font-bold text-slate-800 flex-1">Agency Info</h1>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6">
        <form onSubmit={handleSave} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Company Name</label>
            <input
              type="text"
              value={form.company_name}
              onChange={(e) => setForm(f => ({ ...f, company_name: e.target.value }))}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Address</label>
            <input
              type="text"
              value={form.company_address}
              onChange={(e) => setForm(f => ({ ...f, company_address: e.target.value }))}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Legal Representative</label>
              <input
                type="text"
                value={form.legal_rep}
                onChange={(e) => setForm(f => ({ ...f, legal_rep: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
              <input
                type="text"
                value={form.legal_rep_title}
                onChange={(e) => setForm(f => ({ ...f, legal_rep_title: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">License Number</label>
            <input
              type="text"
              value={form.license_no}
              onChange={(e) => setForm(f => ({ ...f, license_no: e.target.value }))}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Labor Percentage (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={form.labor_percentage}
              onChange={(e) => setForm(f => ({ ...f, labor_percentage: e.target.value }))}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]"
            />
          </div>

          {msg && (
            <p className={`text-sm p-3 rounded-lg ${msg.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
              {msg}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl text-sm min-h-[44px] disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>
    </div>
  );
}
