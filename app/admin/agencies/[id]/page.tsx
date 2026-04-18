'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { DocLink } from '@/lib/types';
import Link from 'next/link';

interface AgencyData {
  id: string;
  company_name: string | null;
  company_address: string | null;
  legal_rep: string | null;
  legal_rep_title: string | null;
  license_no: string | null;
  doc_links: DocLink[];
  labor_percentage: number | null;
  status: string | null;
  created_at: string | null;
}

interface MemberData {
  id: string;
  full_name: string | null;
  short_name: string | null;
  role: string | null;
  status: string | null;
  avatar_url: string | null;
}

function RolePill({ role }: { role: string | null }) {
  const map: Record<string, string> = {
    agent: 'bg-blue-100 text-blue-600',
    manager: 'bg-indigo-100 text-indigo-700',
    operator: 'bg-gray-100 text-gray-600',
  };
  const labels: Record<string, string> = { agent: 'Owner', manager: 'Manager', operator: 'Operator' };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[role || ''] || 'bg-gray-100'}`}>{labels[role || ''] || role}</span>;
}

export default function AgencyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = decodeURIComponent(params.id as string);
  const docInputRef = useRef<HTMLInputElement>(null);

  const [agency, setAgency] = useState<AgencyData | null>(null);
  const [members, setMembers] = useState<MemberData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docs, setDocs] = useState<DocLink[]>([]);

  const [form, setForm] = useState({
    company_name: '',
    company_address: '',
    legal_rep: '',
    legal_rep_title: '',
    license_no: '',
    labor_percentage: '',
  });

  const setField = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
  };

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = {};
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

    try {
      const res = await fetch(`/api/admin/agencies/${encodeURIComponent(id)}`, { headers });
      const data = await res.json();

      if (!res.ok || data.error) {
        setLoadError(data.error || 'Lỗi tải agency');
        setLoading(false);
        return;
      }

      const ag = data.agency as AgencyData;
      setAgency(ag);
      setDocs((ag.doc_links as DocLink[]) || []);
      setMembers((data.members || []) as MemberData[]);
      setForm({
        company_name: ag.company_name ?? '',
        company_address: ag.company_address ?? '',
        legal_rep: ag.legal_rep ?? '',
        legal_rep_title: ag.legal_rep_title ?? '',
        license_no: ag.license_no ?? '',
        labor_percentage: ag.labor_percentage?.toString() ?? '',
      });
    } catch (err) {
      setLoadError('Lỗi tải dữ liệu');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!agency) return;
    setSaving(true);
    setSaveMsg(null);

    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

    const res = await fetch(`/api/admin/agencies/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        company_name: form.company_name.trim() || null,
        company_address: form.company_address.trim() || null,
        legal_rep: form.legal_rep.trim() || null,
        legal_rep_title: form.legal_rep_title.trim() || null,
        license_no: form.license_no.trim() || null,
        labor_percentage: form.labor_percentage ? parseInt(form.labor_percentage, 10) : 0,
      }),
    });

    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setSaveMsg(`❌ ${data.error}`); return; }
    setSaveMsg('✅ Đã lưu');
    setAgency(data.agency);
    setTimeout(() => setSaveMsg(null), 3000);
  };

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !agency) return;
    setUploadingDoc(true);

    const newDocs: DocLink[] = [...docs];
    for (const file of files) {
      const ext = file.name.split('.').pop() || 'bin';
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `agencies/${id}/docs/${safeName}_${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('agent-media').upload(path, file, { upsert: true });
      if (upErr) { console.error(upErr); continue; }
      const { data: urlData } = supabase.storage.from('agent-media').getPublicUrl(path);
      const type: DocLink['type'] = ext === 'pdf' ? 'pdf' : ['doc', 'docx'].includes(ext) ? 'doc' : ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? 'image' : 'other';
      newDocs.push({ name: file.name, url: urlData.publicUrl, type, uploaded_at: new Date().toISOString() });
    }

    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

    const res = await fetch(`/api/admin/agencies/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ doc_links: newDocs }),
    });

    if (res.ok) setDocs(newDocs);
    setUploadingDoc(false);
    if (docInputRef.current) docInputRef.current.value = '';
  };

  const handleDocDelete = async (url: string) => {
    const updated = docs.filter((d) => d.url !== url);
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

    const res = await fetch(`/api/admin/agencies/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ doc_links: updated }),
    });

    if (res.ok) setDocs(updated);
  };

  const handleToggleStatus = async () => {
    if (!agency) return;
    const newStatus = agency.status === 'inactive' ? 'active' : 'inactive';
    setSaving(true);

    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

    const res = await fetch(`/api/admin/agencies/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: newStatus }),
    });

    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setSaveMsg(`❌ ${data.error}`); return; }
    setAgency(data.agency);
    setSaveMsg(`✅ ${newStatus === 'active' ? 'Đã kích hoạt' : 'Đã ngừng hoạt động'}`);
    setTimeout(() => setSaveMsg(null), 3000);
  };

  if (loading) {
    return (
      <div className="p-4 space-y-4 animate-pulse">
        <div className="h-12 bg-gray-200 rounded-xl" />
        <div className="h-24 bg-gray-200 rounded-2xl" />
        <div className="h-48 bg-gray-200 rounded-2xl" />
      </div>
    );
  }

  if (!agency) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500">{loadError || 'Không tìm thấy agency'}</p>
        <Link href="/admin/agents" className="text-blue-600 text-sm mt-2 inline-block">← Quay lại</Link>
      </div>
    );
  }

  const inputCls = 'w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]';

  return (
    <div className="pb-24">
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.back()} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-500 hover:text-gray-800 text-xl">←</button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate text-slate-800">{agency.company_name || agency.id}</p>
        </div>
        {saveMsg && <span className="text-xs text-green-600 font-medium hidden sm:inline">{saveMsg}</span>}
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-xl text-sm font-semibold min-h-[44px] bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? '...' : 'Lưu'}
        </button>
      </div>

      <div className="p-4 space-y-4">
        {saveMsg && <div className="sm:hidden p-3 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg text-center">{saveMsg}</div>}

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-4">
          <div className={`w-14 h-14 rounded-full flex items-center justify-center font-bold text-xl flex-shrink-0 ${agency.status === 'inactive' ? 'bg-red-100 text-red-400' : 'bg-blue-100 text-blue-700'}`}>
            {(agency.company_name || agency.id)[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-slate-800">{agency.company_name || agency.id}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${agency.status === 'inactive' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'}`}>
                {agency.status === 'inactive' ? 'Ngừng HD' : 'Hoạt động'}
              </span>
              <span className="text-xs text-gray-400">{members.length} members</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Thông tin công ty</h2>
            {saving && <span className="text-xs text-blue-500 animate-pulse">Đang lưu...</span>}
          </div>
          <div className="p-4 space-y-3">
            <div><label className="block text-xs text-gray-500 mb-1">Tên công ty</label><input type="text" value={form.company_name} onChange={(e) => setField('company_name', e.target.value)} className={inputCls} /></div>
            <div><label className="block text-xs text-gray-500 mb-1">Địa chỉ</label><input type="text" value={form.company_address} onChange={(e) => setField('company_address', e.target.value)} className={inputCls} /></div>
            <div><label className="block text-xs text-gray-500 mb-1">Người đại diện</label><input type="text" value={form.legal_rep} onChange={(e) => setField('legal_rep', e.target.value)} className={inputCls} /></div>
            <div><label className="block text-xs text-gray-500 mb-1">Chức vụ</label><input type="text" value={form.legal_rep_title} onChange={(e) => setField('legal_rep_title', e.target.value)} className={inputCls} /></div>
            <div><label className="block text-xs text-gray-500 mb-1">Số License</label><input type="text" value={form.license_no} onChange={(e) => setField('license_no', e.target.value)} className={inputCls} /></div>
            <div><label className="block text-xs text-gray-500 mb-1">% Lao động</label><input type="number" min="0" max="100" value={form.labor_percentage} onChange={(e) => setField('labor_percentage', e.target.value)} className={inputCls} /></div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Giấy tờ ({docs.length})</h2>
            <button
              onClick={() => docInputRef.current?.click()}
              disabled={uploadingDoc}
              className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg font-medium hover:bg-blue-100 transition-colors min-h-[36px]"
            >
              {uploadingDoc ? 'Đang tải...' : '+ Thêm file'}
            </button>
            <input ref={docInputRef} type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp" className="hidden" onChange={handleDocUpload} />
          </div>
          {docs.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-8">Chưa có giấy tờ nào</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {docs.map((d) => (
                <div key={d.url} className="px-4 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs text-gray-500 font-bold">{d.type === 'pdf' ? 'PDF' : d.type === 'doc' ? 'DOC' : d.type === 'image' ? 'IMG' : 'FILE'}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700 truncate">{d.name}</p>
                    <p className="text-xs text-gray-400">{new Date(d.uploaded_at).toLocaleDateString('vi-VN')}</p>
                  </div>
                  <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline min-h-[36px] flex items-center px-2">Tải</a>
                  <button onClick={() => handleDocDelete(d.url)} className="text-xs text-red-400 hover:text-red-600 min-h-[36px] flex items-center px-2">Xoá</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50">
            <h2 className="text-sm font-semibold text-slate-700">Team ({members.length})</h2>
          </div>
          {members.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-8">Chưa có member nào</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {members.map((m) => (
                <Link key={m.id} href={`/admin/agents/${m.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${m.status === 'inactive' ? 'bg-red-100 text-red-400' : 'bg-blue-100 text-blue-700'}`}>
                    {(m.short_name || m.full_name || '?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{m.full_name || m.id}</p>
                    <p className="text-xs text-gray-400">{m.id}</p>
                  </div>
                  <RolePill role={m.role} />
                </Link>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={handleToggleStatus}
          disabled={saving}
          className={`w-full py-3 rounded-xl text-sm font-semibold min-h-[44px] transition-colors disabled:opacity-50 ${
            agency.status === 'inactive'
              ? 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200'
              : 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
          }`}
        >
          {agency.status === 'inactive' ? 'Kích hoạt lại' : 'Ngừng hoạt động'}
        </button>
      </div>
    </div>
  );
}
