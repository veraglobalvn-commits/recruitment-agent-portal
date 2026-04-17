'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { Company, CompanyOrderStat, DocLink } from '@/lib/types';
import { compressImage } from '@/lib/imageUtils';
import Link from 'next/link';
import ConfirmDeleteModal from '@/components/admin/ConfirmDeleteModal';

// ── Helpers ─────────────────────────────────────────────
function fmtVnd(val: number | null | undefined) {
  if (!val) return '—';
  if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(1)}B ₫`;
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(0)}M ₫`;
  return val.toLocaleString('vi-VN') + ' ₫';
}

function StatusPill({ label }: { label: string | null }) {
  if (!label) return <span className="text-gray-400 text-xs">—</span>;
  const c: Record<string, string> = {
    'Đang tuyển': 'bg-amber-100 text-amber-700',
    'Đã tuyển đủ': 'bg-green-100 text-green-700',
    'Chưa TT': 'bg-red-100 text-red-600',
    'Đã TT': 'bg-green-100 text-green-700',
  };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c[label] ?? 'bg-gray-100 text-gray-600'}`}>{label}</span>;
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5">
      <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Order ID generator ────────────────────────────────
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

// ── Quick Add Order Modal ──────────────────────────────
function QuickAddOrderModal({ companyId, companyName, companyShortName, onClose, onSaved }: {
  companyId: string; companyName: string; companyShortName: string | null; onClose: () => void; onSaved: () => void;
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

// ── Main page ─────────────────────────────────────────────
export default function CompanyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params.id as string;

  const [company, setCompany] = useState<Company | null>(null);
  const [orders, setOrders] = useState<CompanyOrderStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [showAddOrder, setShowAddOrder] = useState(false);
  const [imgUploading, setImgUploading] = useState(false);
  const [docUploading, setDocUploading] = useState(false);
  const [bctUploading, setBctUploading] = useState(false);
  const [videoUploading, setVideoUploading] = useState<'factory' | 'job' | null>(null);
  const [deletingImg, setDeletingImg] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<'company' | null>(null);
  const [bctDocs, setBctDocs] = useState<DocLink[]>([]);


  const imgInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const bctInputRef = useRef<HTMLInputElement>(null);
  const factoryVideoRef = useRef<HTMLInputElement>(null);
  const jobVideoRef = useRef<HTMLInputElement>(null);

  // Form state
  const [form, setForm] = useState({
    company_name: '', short_name: '', tax_code: '', legal_rep: '',
    legal_rep_title: '', address: '', phone: '', email: '',
    industry: '', business_type: '', business_reg_authority: '', business_reg_date: '',
    en_company_name: '', en_industry: '', en_business_type: '',
    en_address: '', en_legal_rep: '', en_title: '',
  });

  const setField = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  // Load data
  const load = useCallback(async () => {
    setLoading(true);
    const [compRes, ordRes] = await Promise.all([
      supabase.from('companies').select('*').eq('id', id).single(),
      supabase.from('orders').select('id,company_id,job_type,total_labor,labor_missing,status,total_fee_vn,payment_status_vn,service_fee_per_person').eq('company_id', id),
    ]);

    if (compRes.data) {
      const c = compRes.data as Company;
      setCompany({ ...c, company_media: c.company_media ?? [], doc_links: c.doc_links ?? [], bct_bh_links: c.bct_bh_links ?? [] });
      setBctDocs((c.bct_bh_links as DocLink[]) ?? []);
      setForm({
        company_name: c.company_name ?? '',
        short_name: c.short_name ?? '',
        tax_code: c.tax_code ?? '',
        legal_rep: c.legal_rep ?? '',
        legal_rep_title: c.legal_rep_title ?? '',
        address: c.address ?? '',
        phone: c.phone ?? '',
        email: c.email ?? '',
        industry: c.industry ?? '',
        business_type: c.business_type ?? '',
        business_reg_authority: c.business_reg_authority ?? '',
        business_reg_date: c.business_reg_date ?? '',
        en_company_name: c.en_company_name ?? '',
        en_industry: c.en_industry ?? '',
        en_business_type: c.en_business_type ?? '',
        en_address: c.en_address ?? '',
        en_legal_rep: c.en_legal_rep ?? '',
        en_title: c.en_title ?? '',
      });
    }
    setOrders((ordRes.data ?? []) as CompanyOrderStat[]);
    setDirty(false);
    setLoading(false);

    if (searchParams.get('addOrder') === '1') setShowAddOrder(true);
  }, [id, searchParams]);

  useEffect(() => { load(); }, [load]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveMsg(null);
    const { error } = await supabase.from('companies').update({
      company_name: form.company_name.trim(),
      short_name: form.short_name.trim() || null,
      tax_code: form.tax_code.trim() || null,
      legal_rep: form.legal_rep.trim() || null,
      legal_rep_title: form.legal_rep_title.trim() || null,
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      industry: form.industry.trim() || null,
      business_type: form.business_type.trim() || null,
      business_reg_authority: form.business_reg_authority.trim() || null,
      business_reg_date: form.business_reg_date.trim() || null,
      en_company_name: form.en_company_name.trim() || null,
      en_industry: form.en_industry.trim() || null,
      en_business_type: form.en_business_type.trim() || null,
      en_address: form.en_address.trim() || null,
      en_legal_rep: form.en_legal_rep.trim() || null,
      en_title: form.en_title.trim() || null,
    }).eq('id', id);
    setSaving(false);
    if (error) { setSaveMsg(`❌ ${error.message}`); return; }
    setSaveMsg('✅ Đã lưu');
    setDirty(false);
    setTimeout(() => setSaveMsg(null), 3000);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, form]);

  // Auto-save with debounce
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => { handleSave(); }, 1500);
    return () => clearTimeout(timer);
  }, [form, dirty, handleSave]);



  // Upload multiple media files (images or video)
  const uploadSingleMedia = async (file: File) => {
    let blob: Blob = file;
    let ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (file.type.startsWith('image/')) {
      blob = await compressImage(file);
      ext = 'jpg';
    }
    if (!ext) ext = 'bin';
    const path = `companies/${id}/media_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
    const { error: upErr } = await supabase.storage.from('agent-media').upload(path, blob, { upsert: false });
    if (upErr) throw new Error(upErr.message);
    const { data: urlData } = supabase.storage.from('agent-media').getPublicUrl(path);
    return urlData.publicUrl;
  };

  const handleMediaUpload = async (files: File[]) => {
    if (!files.length) return;
    setImgUploading(true);
    try {
      const urls = await Promise.all(files.map(uploadSingleMedia));
      const newMedia = [...(company?.company_media ?? []), ...urls];
      const avatarUrl = company?.avatar_url ?? newMedia.find(u => u.match(/\.(jpe?g|png|webp|gif)$/i)) ?? null;
      const { error: dbErr } = await supabase.from('companies').update({
        company_media: newMedia,
        avatar_url: avatarUrl,
      }).eq('id', id);
      if (dbErr) throw new Error(dbErr.message);
      setCompany((c) => c ? { ...c, company_media: newMedia, avatar_url: avatarUrl } : c);
    } catch (err) {
      alert(`Lỗi upload: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setImgUploading(false);
    }
  };

  // Delete image
  const deleteImage = async (url: string) => {
    setDeletingImg(url);
    const newMedia = (company?.company_media ?? []).filter((u) => u !== url);
    const newAvatar: string | null = company?.avatar_url === url ? (newMedia[0] ?? null) : (company?.avatar_url ?? null);
    const { error } = await supabase.from('companies').update({
      company_media: newMedia,
      avatar_url: newAvatar,
    }).eq('id', id);
    if (!error) setCompany((c) => c ? { ...c, company_media: newMedia, avatar_url: newAvatar } : c);
    setDeletingImg(null);
  };

  // Set avatar manually
  const setAvatar = async (url: string) => {
    await supabase.from('companies').update({ avatar_url: url }).eq('id', id);
    setCompany((c) => c ? { ...c, avatar_url: url } : c);
  };

  // Video fields removed as per unified upload requirement

  // Upload document (general)
  const uploadDoc = async (file: File) => {
    setDocUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `companies/${id}/docs/${Date.now()}_${safeName}`;
      const { error: upErr } = await supabase.storage.from('agent-media').upload(path, file, { upsert: false });
      if (upErr) throw new Error(upErr.message);

      const { data: urlData } = supabase.storage.from('agent-media').getPublicUrl(path);
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'other';
      const type: DocLink['type'] = ext === 'pdf' ? 'pdf' : ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? 'image' : ['doc', 'docx'].includes(ext) ? 'doc' : 'other';

      const newDoc: DocLink = { name: file.name, url: urlData.publicUrl, type, uploaded_at: new Date().toISOString() };
      const newDocs = [...(company?.doc_links ?? []), newDoc];
      const { error: dbErr } = await supabase.from('companies').update({ doc_links: newDocs }).eq('id', id);
      if (dbErr) throw new Error(dbErr.message);

      setCompany((c) => c ? { ...c, doc_links: newDocs } : c);
    } catch (err) {
      alert(`Lỗi upload tài liệu: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDocUploading(false);
    }
  };

  // Delete doc
  const deleteDoc = async (doc: DocLink) => {
    const newDocs = (company?.doc_links ?? []).filter((d) => d.url !== doc.url);
    await supabase.from('companies').update({ doc_links: newDocs }).eq('id', id);
    setCompany((c) => c ? { ...c, doc_links: newDocs } : c);
  };

  // Upload BCT & BH doc
  const uploadBctBh = async (files: File[]) => {
    if (!files.length) return;
    setBctUploading(true);
    try {
      const newDocs: DocLink[] = [...bctDocs];
      for (const file of files) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `companies/${id}/bct_bh/${Date.now()}_${safeName}`;
        const { error: upErr } = await supabase.storage.from('agent-media').upload(path, file, { upsert: false });
        if (upErr) { console.error(upErr); continue; }
        const { data: urlData } = supabase.storage.from('agent-media').getPublicUrl(path);
        const ext = file.name.split('.').pop()?.toLowerCase() ?? 'other';
        const type: DocLink['type'] = ext === 'pdf' ? 'pdf' : ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? 'image' : ['doc', 'docx'].includes(ext) ? 'doc' : 'other';
        newDocs.push({ name: file.name, url: urlData.publicUrl, type, uploaded_at: new Date().toISOString() });
      }
      const { error: dbErr } = await supabase.from('companies').update({ bct_bh_links: newDocs }).eq('id', id);
      if (!dbErr) setBctDocs(newDocs);
    } catch (err) {
      alert(`Lỗi upload BCT&BH: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBctUploading(false);
    }
  };

  const deleteBctBh = async (url: string) => {
    const newDocs = bctDocs.filter((d) => d.url !== url);
    const { error } = await supabase.from('companies').update({ bct_bh_links: newDocs }).eq('id', id);
    if (!error) setBctDocs(newDocs);
  };

  // Soft delete company
  const handleDelete = async () => {
    setDeleting(true);
    setDeleteTarget(null);
    try {
      const mediaUrls = company?.company_media ?? [];
      const docUrls = (company?.doc_links ?? []).map((d) => d.url);
      const allPaths = [...mediaUrls, ...docUrls].map((url) => {
        const u = new URL(url);
        const parts = u.pathname.split('/agent-media/');
        return parts.length > 1 ? parts[1] : null;
      }).filter((p): p is string => !!p);

      if (allPaths.length > 0) {
        await supabase.storage.from('agent-media').remove(allPaths);
      }

      const { error } = await supabase.from('companies').update({
        deleted_at: new Date().toISOString(),
        company_media: [],
        avatar_url: null,
        factory_video_url: null,
        job_video_url: null,
        doc_links: [],
      }).eq('id', id);

      if (error) throw new Error(error.message);
      router.replace('/admin/companies');
    } catch (err) {
      alert(`Xoá thất bại: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDeleting(false);
    }
  };

  const isMissingInfo = !company?.short_name || !company?.tax_code || !company?.legal_rep || !company?.legal_rep_title || !company?.address;

  const totalFee = orders.reduce((s, o) => s + (o.total_fee_vn || 0), 0);
  const paidOrders = orders.filter((o) => o.payment_status_vn === 'Đã TT');
  const totalPaid = paidOrders.reduce((s, o) => s + (o.total_fee_vn || 0), 0);

  const docIcon = (type: DocLink['type']) =>
    ({ pdf: '📄', image: '🖼️', doc: '📝', other: '📎' })[type];

  const inputCls = 'w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]';

  if (loading) {
    return (
      <div className="p-4 space-y-4 animate-pulse">
        <div className="h-12 bg-gray-200 rounded-xl" />
        <div className="h-64 bg-gray-200 rounded-2xl" />
        <div className="h-48 bg-gray-200 rounded-2xl" />
      </div>
    );
  }

  if (!company) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500">Không tìm thấy công ty</p>
        <Link href="/admin/companies" className="text-blue-600 text-sm mt-2 inline-block">← Quay lại</Link>
      </div>
    );
  }

  const avatarSrc = company.avatar_url ?? company.company_media?.[0] ?? null;

  return (
    <div className="pb-24">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.back()} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-500 hover:text-gray-800 text-xl">←</button>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold truncate ${isMissingInfo ? 'text-red-600' : 'text-slate-800'}`}>{company.company_name}</p>
          {company.tax_code && <p className="text-xs text-gray-400">MST: {company.tax_code}</p>}
        </div>
        {saveMsg && <span className="text-xs text-green-600 font-medium">{saveMsg}</span>}
        <button
          onClick={() => handleSave()}
          disabled={saving}
          className={`px-4 py-2 rounded-xl text-sm font-semibold min-h-[44px] transition-colors ${
            dirty ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-100 text-gray-400 cursor-default'
          }`}
        >
          {saving ? '...' : dirty ? 'Lưu *' : 'Đã lưu'}
        </button>
        <button
          onClick={() => setDeleteTarget('company')}
          disabled={deleting}
          className="px-3 py-2 rounded-xl text-sm font-semibold min-h-[44px] text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
          title="Xoá công ty"
        >
          {deleting ? '...' : '🗑️'}
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Avatar + basic */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-4">
          <div className="relative flex-shrink-0">
            {avatarSrc ? (
              <img src={avatarSrc} alt={company.company_name} className="w-16 h-16 rounded-2xl object-cover" />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center text-blue-700 text-2xl font-bold">
                {company.company_name[0]}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className={`font-bold ${isMissingInfo ? 'text-red-600' : 'text-slate-800'}`}>{company.company_name}</p>
            {company.short_name && <p className="text-xs text-gray-400">{company.short_name}</p>}
            <p className="text-xs text-gray-500 mt-1">
              {orders.length} đơn hàng &nbsp;·&nbsp;
              {orders.filter(o => o.status !== 'Đã tuyển đủ').length} đang tuyển
            </p>
          </div>
        </div>

        {/* Công nợ */}
        {orders.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50">
              <h2 className="text-sm font-semibold text-slate-700">Công nợ</h2>
            </div>
            <div className="grid grid-cols-3 gap-0 border-b border-gray-50">
              {[
                { label: 'Tổng phí DV', value: fmtVnd(totalFee), color: 'text-slate-800' },
                { label: 'Đã thu', value: fmtVnd(totalPaid), color: 'text-green-600' },
                { label: 'Còn lại', value: fmtVnd(totalFee - totalPaid), color: 'text-red-500' },
              ].map(({ label, value, color }) => (
                <div key={label} className="px-4 py-3 text-center border-r border-gray-50 last:border-0">
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className={`text-sm font-bold mt-0.5 ${color}`}>{value}</p>
                </div>
              ))}
            </div>
            <div className="divide-y divide-gray-50">
              {orders.map((o) => (
                <div key={o.id} className="flex items-center px-4 py-2.5 gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-700 truncate">{o.id}</p>
                    <p className="text-xs text-gray-400">{o.job_type || '—'}</p>
                  </div>
                  <p className="text-xs font-semibold text-gray-700 flex-shrink-0">{fmtVnd(o.total_fee_vn)}</p>
                  <StatusPill label={o.payment_status_vn} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Đơn tuyển dụng */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Đơn tuyển dụng ({orders.length})</h2>
            <button onClick={() => setShowAddOrder(true)} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 min-h-[36px]">
              + Thêm đơn
            </button>
          </div>
          {orders.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-gray-400 text-sm">Chưa có đơn hàng nào</p>
              <button onClick={() => setShowAddOrder(true)} className="mt-2 text-blue-600 text-sm font-medium">+ Tạo đơn đầu tiên</button>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {orders.map((o) => {
                const done = (o.total_labor ?? 0) - (o.labor_missing ?? o.total_labor ?? 0);
                return (
                  <Link key={o.id} href={`/admin/orders/${encodeURIComponent(o.id)}`}
                    className="block px-4 py-3 hover:bg-gray-50 transition-colors">
                    <div className="flex justify-between items-start mb-1.5 gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-blue-600 truncate">{o.id}</p>
                        <p className="text-xs text-gray-500">{o.job_type || '—'}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <StatusPill label={o.status} />
                        <span className="text-xs text-gray-600 font-semibold">{done}/{o.total_labor ?? 0}</span>
                      </div>
                    </div>
                    <ProgressBar value={done} max={o.total_labor ?? 0} />
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Thông tin cơ bản */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Thông tin cơ bản</h2>
            {saving && <span className="text-xs text-blue-500 animate-pulse">Đang lưu...</span>}
          </div>
          <div className="p-4 space-y-3">
            <div><label className="block text-xs text-gray-500 mb-1">Tên công ty</label><input type="text" value={form.company_name} onChange={(e) => setField('company_name', e.target.value)} className={inputCls} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Tên viết tắt</label>
                <input type="text" value={form.short_name}
                  onChange={(e) => setField('short_name', e.target.value.toUpperCase().replace(/ /g, '_'))}
                  className={inputCls + ' font-mono'} />
                <p className="text-xs text-gray-400 mt-0.5">Dùng gạch dưới, VD: AN_DUONG</p>
              </div>
              <div><label className="block text-xs text-gray-500 mb-1">Mã số thuế</label><input type="text" value={form.tax_code} onChange={(e) => setField('tax_code', e.target.value)} className={inputCls} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs text-gray-500 mb-1">Người đại diện</label><input type="text" value={form.legal_rep} onChange={(e) => setField('legal_rep', e.target.value)} className={inputCls} /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Chức vụ</label><input type="text" value={form.legal_rep_title} onChange={(e) => setField('legal_rep_title', e.target.value)} className={inputCls} /></div>
            </div>
            <div><label className="block text-xs text-gray-500 mb-1">Địa chỉ</label><input type="text" value={form.address} onChange={(e) => setField('address', e.target.value)} className={inputCls} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs text-gray-500 mb-1">SĐT</label><input type="text" value={form.phone} onChange={(e) => setField('phone', e.target.value)} className={inputCls} /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Email</label><input type="text" value={form.email} onChange={(e) => setField('email', e.target.value)} className={inputCls} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs text-gray-500 mb-1">Ngành nghề</label><input type="text" value={form.industry} onChange={(e) => setField('industry', e.target.value)} className={inputCls} /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Loại hình DN</label><input type="text" value={form.business_type} onChange={(e) => setField('business_type', e.target.value)} className={inputCls} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs text-gray-500 mb-1">Cơ quan cấp ĐKKD</label><input type="text" value={form.business_reg_authority} onChange={(e) => setField('business_reg_authority', e.target.value)} className={inputCls} /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Ngày cấp</label><input type="text" value={form.business_reg_date} onChange={(e) => setField('business_reg_date', e.target.value)} className={inputCls} /></div>
            </div>
          </div>
        </div>

        {/* Thông tin tiếng Anh */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Thông tin tiếng Anh</h2>

          </div>
          <div className="p-4 space-y-3">
            <div><label className="block text-xs text-gray-500 mb-1">Company Name (EN)</label><input type="text" value={form.en_company_name} onChange={(e) => setField('en_company_name', e.target.value)} className={inputCls} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs text-gray-500 mb-1">Industry (EN)</label><input type="text" value={form.en_industry} onChange={(e) => setField('en_industry', e.target.value)} className={inputCls} /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Business Type (EN)</label><input type="text" value={form.en_business_type} onChange={(e) => setField('en_business_type', e.target.value)} className={inputCls} /></div>
            </div>
            <div><label className="block text-xs text-gray-500 mb-1">Address (EN)</label><input type="text" value={form.en_address} onChange={(e) => setField('en_address', e.target.value)} className={inputCls} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs text-gray-500 mb-1">Legal Rep (EN)</label><input type="text" value={form.en_legal_rep} onChange={(e) => setField('en_legal_rep', e.target.value)} className={inputCls} /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Title (EN)</label><input type="text" value={form.en_title} onChange={(e) => setField('en_title', e.target.value)} className={inputCls} /></div>
            </div>
          </div>
        </div>

        {/* Cơ sở vật chất & Tài liệu */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50">
            <h2 className="text-sm font-semibold text-slate-700">Cơ sở vật chất & Tài liệu</h2>
          </div>
          <div className="p-4 space-y-4">

            {/* Images */}
            <div>
              <p className="text-xs text-gray-500 mb-2">Ảnh/Video cơ sở vật chất & công việc</p>
              <div className="flex flex-wrap gap-2">
                {(company.company_media ?? []).map((url) => {
                  const isVideo = url.match(/\.(mp4|webm|mov)$/i);
                  return (
                    <div key={url} className="relative group w-20 h-20">
                      {isVideo ? (
                        <video src={url} className="w-full h-full object-cover rounded-xl" muted />
                      ) : (
                        <img
                          src={url} alt="facility"
                          className={`w-full h-full object-cover rounded-xl cursor-pointer transition-all ${
                            company.avatar_url === url ? 'ring-2 ring-blue-500' : 'hover:ring-2 hover:ring-gray-300'
                          }`}
                          onClick={() => setAvatar(url)}
                          title="Bấm để đặt làm avatar"
                        />
                      )}
                      {isVideo && <span className="absolute top-1 left-1 bg-black/60 text-white text-[10px] px-1 rounded font-bold">VIDEO</span>}
                      {company.avatar_url === url && !isVideo && (
                        <span className="absolute top-1 left-1 bg-blue-500 text-white text-[10px] px-1 rounded font-bold">AVT</span>
                      )}
                      <button
                        onClick={() => deleteImage(url)}
                        disabled={deletingImg === url}
                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs hidden group-hover:flex items-center justify-center"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
                <button
                  onClick={() => imgInputRef.current?.click()}
                  disabled={imgUploading}
                  className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors cursor-pointer"
                >
                  <span className="text-xl mb-1">+</span>
                  {imgUploading ? <span className="text-[10px]">Đang up...</span> : <span className="text-[10px]">Thêm Media</span>}
                </button>
              </div>
              <input ref={imgInputRef} type="file" accept="image/*,video/*" multiple className="hidden"
                onChange={(e) => { handleMediaUpload(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
            </div>



            {/* General Documents */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-500">Tài liệu (PDF, ảnh, Word...)</p>
                <button
                  onClick={() => docInputRef.current?.click()}
                  disabled={docUploading}
                  className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg min-h-[36px] flex items-center gap-1"
                >
                  {docUploading ? 'Đang up...' : '+ Upload'}
                </button>
              </div>
              <input ref={docInputRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadDoc(f); e.target.value = ''; }} />
              {(company.doc_links ?? []).length === 0 ? (
                <p className="text-xs text-gray-300 text-center py-4">Chưa có tài liệu nào</p>
              ) : (
                <div className="space-y-2">
                  {(company.doc_links ?? []).map((doc) => (
                    <div key={doc.url} className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-xl">
                      <span className="text-lg">{docIcon(doc.type)}</span>
                      <a href={doc.url} target="_blank" rel="noopener noreferrer"
                        className="flex-1 text-xs text-blue-600 hover:underline truncate font-medium">{doc.name}</a>
                      <button onClick={() => deleteDoc(doc)} className="text-gray-300 hover:text-red-500 text-xs min-w-[32px] min-h-[32px] flex items-center justify-center">✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* BCT & BH Documents */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">BCT & BH (Báo cáo thuế & Bảo hiểm)</h2>
            <button
              onClick={() => bctInputRef.current?.click()}
              disabled={bctUploading}
              className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg min-h-[36px] flex items-center gap-1"
            >
              {bctUploading ? 'Đang up...' : '+ Upload'}
            </button>
          </div>
          <input ref={bctInputRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp" multiple className="hidden"
            onChange={(e) => { uploadBctBh(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
          {bctDocs.length === 0 ? (
            <p className="text-xs text-gray-300 text-center py-6">Chưa có tài liệu BCT & BH nào</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {bctDocs.map((doc) => (
                <div key={doc.url} className="flex items-center gap-2 px-4 py-3">
                  <span className="text-lg">{docIcon(doc.type)}</span>
                  <a href={doc.url} target="_blank" rel="noopener noreferrer"
                    className="flex-1 text-xs text-blue-600 hover:underline truncate font-medium">{doc.name}</a>
                  <span className="text-xs text-gray-400 flex-shrink-0">{new Date(doc.uploaded_at).toLocaleDateString('vi-VN')}</span>
                  <button onClick={() => deleteBctBh(doc.url)} className="text-gray-300 hover:text-red-500 text-xs min-w-[32px] min-h-[32px] flex items-center justify-center">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showAddOrder && (
        <QuickAddOrderModal
          companyId={id}
          companyName={company.company_name}
          companyShortName={company.short_name}
          onClose={() => setShowAddOrder(false)}
          onSaved={load}
        />
      )}

      {deleteTarget === 'company' && (
        <ConfirmDeleteModal
          title="Xoá công ty"
          description="Dữ liệu ảnh/video/tài liệu sẽ bị xoá vĩnh viễn. Hành động này không thể hoàn tác."
          itemName="công ty"
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
