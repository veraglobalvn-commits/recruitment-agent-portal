'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Company } from '@/lib/types';
import { compressToBase64, compressImage } from '@/lib/imageUtils';

interface CompanyFormModalProps {
  onClose: () => void;
  onSaved: (company: Company, andAddOrder: boolean) => void;
}

interface OcrParsed {
  taxCode: string;
  companyName: string;
  shortName: string;
  legalRep: string;
  legalRepTitle: string;
  address: string;
  phone: string;
  email: string;
  industry: string;
  regAuthority: string;
  regDate: string;
}

const EMPTY_FORM = {
  company_name: '',
  short_name: '',
  tax_code: '',
  legal_rep: '',
  legal_rep_title: '',
  address: '',
  phone: '',
  email: '',
  industry: '',
  business_reg_authority: '',
  business_reg_date: '',
};

function Field({
  label, value, onChange, placeholder, required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]"
      />
    </div>
  );
}

export default function CompanyFormModal({ onClose, onSaved }: CompanyFormModalProps) {
  const [tab, setTab] = useState<'manual' | 'scan'>('manual');
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrRaw, setOcrRaw] = useState<string | null>(null);
  const [ocrImg, setOcrImg] = useState<string | null>(null); // preview URL
  const scanInputRef = useRef<HTMLInputElement>(null);

  const set = (k: keyof typeof EMPTY_FORM, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const setShortName = (v: string) =>
    setForm((f) => ({ ...f, short_name: v.toUpperCase().replace(/ /g, '_') }));

  // OCR: compress → send → pre-fill
  const handleScanFile = useCallback(async (file: File) => {
    setOcrLoading(true);
    setError(null);
    try {
      // Preview
      setOcrImg(URL.createObjectURL(file));
      // Compress + base64
      const base64 = await compressToBase64(file);
      const { data: { session: sess } } = await supabase.auth.getSession();
      const res = await fetch('/api/ocr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sess?.access_token ? { Authorization: `Bearer ${sess.access_token}` } : {}),
        },
        body: JSON.stringify({ imageBase64: base64 }),
      });
      const data: { parsed?: OcrParsed; rawText?: string; error?: string } = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? 'OCR thất bại');

      const p = data.parsed!;
      setForm({
        company_name: p.companyName || '',
        short_name: p.shortName || '',
        tax_code: p.taxCode || '',
        legal_rep: p.legalRep || '',
        legal_rep_title: p.legalRepTitle || '',
        address: p.address || '',
        phone: p.phone || '',
        email: p.email || '',
        industry: p.industry || '',
        business_reg_authority: p.regAuthority || '',
        business_reg_date: p.regDate || '',
      });
      setOcrRaw(data.rawText ?? null);
      setTab('manual'); // switch to form for review
    } catch (err) {
      setError(`OCR lỗi: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setOcrLoading(false);
    }
  }, []);

  // Show loading overlay on scan tab when processing
  const scanLabel = ocrLoading
    ? '⏳ Đang xử lý... (OCR → AI trích xuất)'
    : '✅ Đã nhận dạng — kiểm tra lại trước khi lưu';

  const handleSave = async (andAddOrder = false) => {
    if (!form.company_name.trim()) { setError('Tên công ty là bắt buộc'); return; }
    setSaving(true);
    setError(null);
    try {
      const nameTrim = form.company_name.trim();
      const taxTrim = form.tax_code.trim();

      const dupChecks = await Promise.all([
        taxTrim ? supabase.from('companies').select('id').eq('tax_code', taxTrim).is('deleted_at', null) : { data: null },
        supabase.from('companies').select('id, company_name').ilike('company_name', nameTrim).is('deleted_at', null).limit(1),
      ]);
      const dupByTax = dupChecks[0].data as Array<{ id: string }> | null;
      const dupByName = dupChecks[1].data as Array<{ id: string; company_name: string }> | null;
      if (dupByTax?.length) throw new Error(`Mã số thuế ${taxTrim} đã tồn tại`);
      if (dupByName?.length) throw new Error(`Công ty "${dupByName[0].company_name}" đã tồn tại`);

      const payload = {
        company_name: nameTrim,
        short_name: form.short_name.trim() || null,
        tax_code: taxTrim || null,
        legal_rep: form.legal_rep.trim() || null,
        legal_rep_title: form.legal_rep_title.trim() || null,
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        industry: form.industry.trim() || null,
        business_reg_authority: form.business_reg_authority.trim() || null,
        business_reg_date: form.business_reg_date.trim() || null,
        company_media: [],
        doc_links: [],
      };
      const { data, error: dbErr } = await supabase
        .from('companies')
        .insert(payload)
        .select()
        .single();
      if (dbErr) throw new Error(dbErr.message);
      // Fire-and-forget translate after company creation
      if (data?.id) {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.access_token) {
            fetch('/api/translate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
              body: JSON.stringify({ company_id: data.id }),
            }).catch(() => {});
          }
        });
      }
      onSaved(data as Company, andAddOrder);
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
        {/* Handle */}
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-3 sm:hidden flex-shrink-0" />

        {/* Header */}
        <div className="flex justify-between items-center px-5 pt-4 pb-3 flex-shrink-0">
          <h2 className="text-base font-bold text-gray-800">Thêm công ty</h2>
          <button onClick={onClose} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-gray-700 text-xl">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-5 flex-shrink-0">
          {(['manual', 'scan'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors min-h-[44px] ${
                tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'manual' ? '✏️ Nhập thủ công' : '📷 Scan ĐKKD'}
            </button>
          ))}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>
          )}

          {tab === 'scan' ? (
            <div className="space-y-4">
              {/* Scan area */}
              <div
                className="border-2 border-dashed border-gray-300 rounded-2xl p-6 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all min-h-[120px] flex flex-col items-center justify-center gap-2"
                onClick={() => scanInputRef.current?.click()}
              >
                {ocrImg ? (
                  <div className="w-full">
                    <img src={ocrImg} alt="ĐKKD preview" className="max-h-40 object-contain rounded-lg mx-auto" />
                    {ocrLoading && (
                      <div className="mt-3 text-center">
                        <p className="text-sm text-blue-600 font-medium animate-pulse">⏳ Đang xử lý OCR → AI trích xuất...</p>
                        <p className="text-xs text-gray-400 mt-1">Thường mất 3–8 giây</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <span className="text-4xl">📄</span>
                    <p className="text-sm text-gray-600 font-medium">Chụp hoặc chọn ảnh ĐKKD</p>
                    <p className="text-xs text-gray-400">Ảnh nén tự động • AI nhận dạng tiếng Việt</p>
                  </>
                )}
              </div>
              <input
                ref={scanInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleScanFile(f); e.target.value = ''; }}
              />
              {ocrRaw && (
                <details className="text-xs text-gray-400">
                  <summary className="cursor-pointer hover:text-gray-600">Xem văn bản nhận dạng được</summary>
                  <pre className="mt-2 whitespace-pre-wrap bg-gray-50 p-2 rounded text-xs max-h-32 overflow-y-auto">{ocrRaw}</pre>
                </details>
              )}
              {ocrImg && !ocrLoading && (
                <p className="text-sm text-green-600 text-center">✅ Đã nhận dạng — chuyển sang tab nhập thủ công để xem lại</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {ocrImg && (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                  <span>✅</span>
                  <span>Đã pre-fill từ OCR — kiểm tra lại trước khi lưu</span>
                </div>
              )}
              <Field label="Tên công ty" value={form.company_name} onChange={(v) => set('company_name', v)} placeholder="CÔNG TY TNHH..." required />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Tên viết tắt</label>
                  <input
                    type="text"
                    value={form.short_name}
                    onChange={(e) => setShortName(e.target.value)}
                    placeholder="VD: AN_DUONG"
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px] font-mono"
                  />
                  <p className="text-xs text-gray-400 mt-0.5">Dùng gạch dưới, VD: AN_DUONG</p>
                </div>
                <Field label="Mã số thuế" value={form.tax_code} onChange={(v) => set('tax_code', v)} placeholder="0123456789" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Người đại diện" value={form.legal_rep} onChange={(v) => set('legal_rep', v)} placeholder="Nguyễn Văn A" />
                <Field label="Chức vụ" value={form.legal_rep_title} onChange={(v) => set('legal_rep_title', v)} placeholder="Giám đốc" />
              </div>
              <Field label="Địa chỉ" value={form.address} onChange={(v) => set('address', v)} placeholder="Số 1, Đường..., Quận..., TP..." />
              <div className="grid grid-cols-2 gap-3">
                <Field label="SĐT" value={form.phone} onChange={(v) => set('phone', v)} placeholder="0901..." />
                <Field label="Email" value={form.email} onChange={(v) => set('email', v)} placeholder="contact@..." />
              </div>
              <Field label="Ngành nghề" value={form.industry} onChange={(v) => set('industry', v)} placeholder="Xây dựng, Điện tử..." />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Cơ quan cấp ĐKKD" value={form.business_reg_authority} onChange={(v) => set('business_reg_authority', v)} placeholder="Sở KH&ĐT..." />
                <Field label="Ngày cấp" value={form.business_reg_date} onChange={(v) => set('business_reg_date', v)} placeholder="01/01/2020" />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2 flex-shrink-0">
          <button
            onClick={() => handleSave(false)}
            disabled={saving || ocrLoading}
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 rounded-xl text-sm disabled:opacity-50 min-h-[44px]"
          >
            {saving ? 'Đang lưu...' : 'Lưu'}
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={saving || ocrLoading}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-50 min-h-[44px]"
          >
            Lưu & thêm đơn hàng →
          </button>
        </div>
      </div>
    </div>
  );
}
