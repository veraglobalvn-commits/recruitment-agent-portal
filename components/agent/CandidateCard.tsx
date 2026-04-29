'use client';

import { useState, useRef, useEffect } from 'react';
import type { Candidate } from '@/lib/types';
import { supabase } from '@/lib/supabase';

interface CandidateCardProps {
  candidate: Candidate;
  orderId: string;
  onVideoUploadClick: (id: string) => void;
  onCandidateUpdate: (id: string, updates: Partial<Candidate>) => void;
  onCandidateDelete?: (id: string) => void;
  isVideoUploading: boolean;
  onStatusChange?: (id: string, status: 'Passed' | 'Failed') => void;
  currentStatus?: string | null;
  useDropdown?: boolean;
  canSetStatus?: boolean;
  orderInfo?: { id: string; company_name: string | null; job_type: string | null };
  agentInfo?: { short_name: string | null; full_name: string | null };
  addedBy?: string | null;
  isNewVideo?: boolean;
  onVideoViewed?: () => void;
  onVideoPlay?: (url: string) => void;
  isSelected?: boolean;
  onToggleSelect?: (id: string, selected: boolean) => void;
}

export default function CandidateCard({
  candidate,
  orderId,
  onVideoUploadClick,
  onCandidateUpdate,
  onCandidateDelete,
  isVideoUploading,
  onStatusChange,
  currentStatus,
  useDropdown,
  canSetStatus = true,
  orderInfo,
  agentInfo,
  addedBy,
  isNewVideo,
  onVideoViewed,
  onVideoPlay,
  isSelected,
  onToggleSelect,
}: CandidateCardProps) {

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [pccUploading, setPccUploading] = useState(false);
  const [healthCertUploading, setHealthCertUploading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [form, setForm] = useState({
    full_name: candidate.full_name ?? '',
    pp_no: candidate.pp_no ?? '',
    dob: candidate.dob ?? '',
    pp_doi: candidate.pp_doi ?? '',
    pp_doe: candidate.pp_doe ?? '',
    pob: candidate.pob ?? '',
    address: candidate.address ?? '',
    phone: candidate.phone ?? '',
    height_ft: candidate.height_ft?.toString() ?? '',
    weight_kg: candidate.weight_kg?.toString() ?? '',
  });
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<'Passed' | 'Failed' | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setStatusDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleConfirm = () => {
    if (pendingStatus && onStatusChange) {
      onStatusChange(candidate.id_ld, pendingStatus);
      setPendingStatus(null);
      setStatusDropdownOpen(false);
    }
  };

  const photoInputRef = useRef<HTMLInputElement>(null);
  const pccInputRef = useRef<HTMLInputElement>(null);
  const healthCertInputRef = useRef<HTMLInputElement>(null);

  const safeId = candidate.id_ld.replace(/[^a-zA-Z0-9-]/g, '_');
  const safeOrder = orderId.replace(/[^a-zA-Z0-9-]/g, '_');

  // Passed candidates are locked — enforced at API level too
  const canDelete = candidate.interview_status !== 'Passed';

  const saveEdit = async () => {
    setSaving(true);
    const updates: Partial<Candidate> = {
      full_name: form.full_name || null,
      pp_no: form.pp_no || null,
      dob: form.dob || null,
      pp_doi: form.pp_doi || null,
      pp_doe: form.pp_doe || null,
      pob: form.pob || null,
      address: form.address || null,
      phone: form.phone || null,
      height_ft: form.height_ft ? parseFloat(form.height_ft) : null,
      weight_kg: form.weight_kg ? parseFloat(form.weight_kg) : null,
    };
    try {
      const { error } = await supabase
        .from('candidates')
        .update(updates)
        .eq('id_ld', candidate.id_ld);
      if (error) throw new Error(error.message);

      const n8nUrl = process.env.NEXT_PUBLIC_N8N_VIDEO_UPDATE_URL;
      if (n8nUrl) {
        fetch(n8nUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ candidate_id: candidate.id_ld, ...updates }),
        }).catch(() => {});
      }
      onCandidateUpdate(candidate.id_ld, updates);
      setEditing(false);
    } catch (err) {
      alert(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const uploadFile = async (
    file: File,
    pathPrefix: string,
    field: 'photo_link' | 'pcc_link' | 'health_cert_link',
    setUploading: (v: boolean) => void,
  ) => {
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const filePath = `${safeOrder}/${safeId}/${pathPrefix}_${Date.now()}.${ext}`;
      const { error: storageErr } = await supabase.storage
        .from('agent-media')
        .upload(filePath, file, { cacheControl: '3600', upsert: false });
      if (storageErr) throw new Error(`Storage: ${storageErr.message}`);

      const { data: urlData } = supabase.storage.from('agent-media').getPublicUrl(filePath);
      const publicUrl = urlData.publicUrl;

      const { error: dbErr } = await supabase
        .from('candidates')
        .update({ [field]: publicUrl })
        .eq('id_ld', candidate.id_ld);
      if (dbErr) throw new Error(`DB: ${dbErr.message}`);

      const n8nUrl = process.env.NEXT_PUBLIC_N8N_VIDEO_UPDATE_URL;
      if (n8nUrl) {
        fetch(n8nUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ candidate_id: candidate.id_ld, [field]: publicUrl }),
        }).catch(() => {});
      }

      onCandidateUpdate(candidate.id_ld, { [field]: publicUrl });
    } catch (err) {
      console.error('Upload failed:', err);
      alert(`Upload error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUploading(false);
    }
  };

  const renderDocBtn = (
    label: string,
    link: string | null,
    uploading: boolean,
    onUpload: () => void,
  ) => {
    if (link) {
      return (
        <a href={link} target="_blank" rel="noopener noreferrer"
          className="text-xs bg-green-100 text-green-700 px-3 py-2 rounded-lg hover:bg-green-200 min-h-[44px] flex items-center font-medium">
          {label}
        </a>
      );
    }
    if (uploading) {
      return (
        <button disabled className="text-xs bg-yellow-100 text-yellow-600 px-3 py-2 rounded-lg min-h-[44px] flex items-center gap-1 cursor-not-allowed">
          <span className="inline-block w-3 h-3 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
          {label}
        </button>
      );
    }
    return (
      <button onClick={onUpload}
        className="text-xs bg-red-100 text-red-600 px-3 py-2 rounded-lg hover:bg-red-200 min-h-[44px] flex items-center gap-1 font-medium">
        {label}
      </button>
    );
  };

  const isMissingCandidate = !candidate.pp_no || !candidate.interview_status;

  return (
    <div className={`border rounded-xl hover:shadow-md transition-shadow bg-white overflow-hidden ${isNewVideo ? 'border-yellow-400 ring-2 ring-yellow-200' : isMissingCandidate ? 'border-red-200 bg-red-50/20' : 'border-gray-200'}`}>
      {/* Header: Photo + Name + ID */}
      <div className="flex items-start gap-3 p-4 pb-3">
        {onToggleSelect && (
          <div className="flex-shrink-0 pt-3">
            <input
              type="checkbox"
              checked={!!isSelected}
              onChange={(e) => onToggleSelect(candidate.id_ld, e.target.checked)}
              className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
            />
          </div>
        )}
        <div className="relative flex-shrink-0">
          {candidate.photo_link ? (
            <img src={candidate.photo_link} alt={candidate.full_name ?? ''} className="w-14 h-14 rounded-full object-cover border-2 border-gray-200" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center border-2 border-dashed border-gray-300">
              <span className="text-gray-400 text-xs text-center leading-tight">No<br/>Photo</span>
            </div>
          )}
          <button onClick={() => photoInputRef.current?.click()} disabled={photoUploading}
            title="Upload photo"
            className="absolute -bottom-1 -right-1 w-5 h-5 bg-blue-600 text-white rounded-full text-xs flex items-center justify-center hover:bg-blue-700 disabled:opacity-50">
            {photoUploading ? '…' : '📷'}
          </button>
          <input ref={photoInputRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f, 'photo', 'photo_link', setPhotoUploading); e.target.value = ''; }} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-1 mb-0.5">
            <h3 className="font-bold text-gray-800 text-sm leading-tight flex-1 min-w-0 truncate">{candidate.full_name || <span className="text-red-400">N/A</span>}</h3>
          </div>
          {candidate.interview_status && !onStatusChange && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              candidate.interview_status === 'Passed' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
              {candidate.interview_status === 'Passed' ? '✓ Passed' : '✗ Failed'}
            </span>
          )}
        </div>
      </div>

      {/* Passport Info - Collapsible */}
      <div className="px-4 pb-3">
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-gray-400 text-xs">Passport number:</span>
              <span className={`font-semibold text-sm ${candidate.pp_no ? 'text-gray-800' : 'text-red-400'}`}>{candidate.pp_no || 'N/A'}</span>
            </div>
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50 min-h-[32px] flex items-center gap-1"
            >
              {showDetails ? '▼ Hide' : '▶ Show'}
            </button>
          </div>

          {showDetails && (
            <div className="space-y-1.5 text-xs border-t border-gray-200 pt-2 mt-2">
              <div className="flex items-start gap-2">
                <span className="text-gray-400 w-24 flex-shrink-0">Date of birth:</span>
                <span className={`font-semibold ${candidate.dob ? 'text-gray-800' : 'text-red-400'}`}>{candidate.dob || 'N/A'}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-gray-400 w-24 flex-shrink-0">Issued date:</span>
                <span className={`font-semibold ${candidate.pp_doi ? 'text-gray-800' : 'text-red-400'}`}>{candidate.pp_doi || 'N/A'}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-gray-400 w-24 flex-shrink-0">Expires date:</span>
                <span className={`font-semibold ${candidate.pp_doe ? 'text-gray-800' : 'text-red-400'}`}>{candidate.pp_doe || 'N/A'}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-gray-400 w-24 flex-shrink-0">Address:</span>
                <span className={`font-semibold ${candidate.address ? 'text-gray-800' : 'text-red-400'}`}>{candidate.address || 'N/A'}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-gray-400 w-24 flex-shrink-0">Phone:</span>
                <span className={`font-semibold ${candidate.phone ? 'text-gray-800' : 'text-red-400'}`}>{candidate.phone || 'N/A'}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-gray-400 w-24 flex-shrink-0">Weight:</span>
                <span className={`font-semibold ${candidate.weight_kg ? 'text-gray-800' : 'text-red-400'}`}>{candidate.weight_kg ? `${candidate.weight_kg}kg` : 'N/A'}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-gray-400 w-24 flex-shrink-0">Height:</span>
                <span className={`font-semibold ${candidate.height_ft ? 'text-gray-800' : 'text-red-400'}`}>{candidate.height_ft ? `${candidate.height_ft}ft` : 'N/A'}</span>
              </div>
              {candidate.candidate_confirmed && (
                <div className="border-t border-gray-200 pt-2 mt-2">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-gray-400 w-24 flex-shrink-0">Consent:</span>
                    <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-medium">Consent ✓</span>
                  </div>
                  <ul className="space-y-0.5 ml-2">
                    {([
                      ['q1_viewed_materials', 'Reviewed materials'],
                      ['q2_agrees_terms', 'Agrees to terms'],
                      ['q3_agrees_overtime', 'Accepts overtime'],
                      ['q4_accepts_food', 'Accepts food arrangement'],
                      ['q5_agrees_prayer', 'Agrees to prayer schedule'],
                      ['q6_has_questions', 'Had questions'],
                      ['q7_confirms_penalty', 'Accepts penalty clause'],
                    ] as const).map(([key, label]) => {
                      const val = candidate.candidate_confirmed?.[key];
                      return (
                        <li key={key} className="flex items-start gap-2">
                          <span className={val ? 'text-green-600' : 'text-red-500'}>{val ? '✓' : '✗'}</span>
                          <span className="text-gray-600">{label}</span>
                        </li>
                      );
                    })}
                  </ul>
                  {candidate.candidate_confirmed.q6_has_questions && candidate.candidate_confirmed.q6_questions_text && (
                    <div className="text-gray-500 text-xs italic ml-4 mt-1">
                      Questions: {candidate.candidate_confirmed.q6_questions_text}
                    </div>
                  )}
                </div>
              )}
              <div className="flex gap-2 mt-3 pt-2 border-t border-gray-200">
                <button onClick={() => setEditing(true)}
                  className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50 min-h-[36px] flex items-center gap-1">
                  ✏️ Edit
                </button>
                {canDelete && onCandidateDelete && (
                  <button onClick={() => { if (confirm('Delete this candidate?')) onCandidateDelete(candidate.id_ld); }}
                    className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 min-h-[36px] flex items-center gap-1">
                    🗑 Delete
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Order & Agent Info */}
      <div className="px-4 pb-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
        {orderInfo && (
          <>
            <span className="font-semibold text-gray-700">{orderInfo.id}</span>
            {orderInfo.company_name && <span className="text-gray-400">·</span>}
            {orderInfo.company_name && <span className="text-gray-600">{orderInfo.company_name}</span>}
            {orderInfo.job_type && <span className="text-gray-400">·</span>}
            {orderInfo.job_type && <span className="text-gray-600">{orderInfo.job_type}</span>}
          </>
        )}
        {agentInfo && (
          <>
            {orderInfo && <span className="text-gray-400">·</span>}
            <span className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full">{agentInfo.short_name || agentInfo.full_name}</span>
          </>
        )}
        {addedBy && (
          <>
            <span className="text-gray-400">·</span>
            <span className="bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded-full text-xs">Added by: {addedBy}</span>
          </>
        )}
      </div>

      {/* Doc Buttons: Video, Passport, PCC, Health Cert */}
      <div className="px-4 pb-4 space-y-2">
        <div className="flex flex-wrap gap-2">
          {/* Video - multi-video support with legacy fallback */}
          {(() => {
            const urls = (candidate.video_links && candidate.video_links.length > 0)
              ? candidate.video_links
              : (candidate.video_link ? [candidate.video_link] : []);
            if (urls.length > 0) {
              return urls.map((url, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    onVideoViewed?.();
                    if (onVideoPlay) {
                      onVideoPlay(url);
                    } else {
                      window.open(url, '_blank', 'noopener,noreferrer');
                    }
                  }}
                  className={`text-xs px-3 py-2 rounded-lg hover:bg-green-200 min-h-[44px] flex items-center font-medium ${
                    idx === 0 && isNewVideo ? 'bg-yellow-100 text-yellow-700 animate-pulse' : 'bg-green-100 text-green-700'
                  }`}
                >
                  ▶ Video{urls.length > 1 ? ` ${idx + 1}` : ''}
                </button>
              ));
            }
            if (isVideoUploading) {
              return (
                <button disabled className="text-xs bg-yellow-100 text-yellow-600 px-3 py-2 rounded-lg min-h-[44px] flex items-center gap-1 cursor-not-allowed">
                  <span className="inline-block w-3 h-3 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
                  Video
                </button>
              );
            }
            return (
              <button onClick={() => onVideoUploadClick(candidate.id_ld)}
                className="text-xs bg-red-100 text-red-600 px-3 py-2 rounded-lg hover:bg-red-200 min-h-[44px] flex items-center gap-1 font-medium">
                ▶ Video
              </button>
            );
          })()}

          {/* Passport - view only, uploaded by OCR */}
          {candidate.passport_link ? (
            <a href={candidate.passport_link} target="_blank" rel="noopener noreferrer"
              className="text-xs bg-green-100 text-green-700 px-3 py-2 rounded-lg hover:bg-green-200 min-h-[44px] flex items-center font-medium">
              🪪 Passport
            </a>
          ) : (
            <span className="text-xs bg-red-100 text-red-600 px-3 py-2 rounded-lg min-h-[44px] flex items-center font-medium">
              🪪 Passport
            </span>
          )}

          {/* PCC */}
          {renderDocBtn('📋 PCC', candidate.pcc_link, pccUploading, () => pccInputRef.current?.click())}
          {/* Health Cert */}
          {renderDocBtn('🏥 Health Cert', candidate.health_cert_link, healthCertUploading, () => healthCertInputRef.current?.click())}

          <input ref={pccInputRef} type="file" accept="image/*,application/pdf" capture="environment" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f, 'pcc', 'pcc_link', setPccUploading); e.target.value = ''; }} />
          <input ref={healthCertInputRef} type="file" accept="image/*,application/pdf" capture="environment" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f, 'healthcert', 'health_cert_link', setHealthCertUploading); e.target.value = ''; }} />
        </div>

        {onStatusChange && canSetStatus && (
          <div className="flex items-center gap-2">
            {useDropdown ? (
              <div ref={dropdownRef} className="relative">
                <button
                  onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
                  className="text-sm px-4 py-2 rounded-lg font-semibold min-h-[44px] min-w-[100px] transition-colors bg-gray-100 text-gray-700 hover:bg-gray-200 flex items-center gap-1"
                >
                  {candidate.interview_status || 'Pending'} ▼
                </button>
                {statusDropdownOpen && (
                  <div className="absolute bottom-full left-0 mb-2 bg-white border border-gray-200 rounded-xl shadow-lg z-10 min-w-[120px]">
                    <button
                      onClick={() => { setPendingStatus('Passed'); }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-green-50 min-h-[40px] flex items-center gap-2 ${
                        candidate.interview_status === 'Passed' ? 'bg-green-50 text-green-700 font-medium' : 'text-gray-700'
                      }`}
                    >
                      ✓ Passed
                    </button>
                    <button
                      onClick={() => { setPendingStatus('Failed'); }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-red-50 min-h-[40px] flex items-center gap-2 ${
                        candidate.interview_status === 'Failed' ? 'bg-red-50 text-red-700 font-medium' : 'text-gray-700'
                      }`}
                    >
                      ✗ Failed
                    </button>
                    {candidate.interview_status && (
                      <button
                        onClick={() => { setPendingStatus(null); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 min-h-[40px] text-gray-700"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                )}
                {pendingStatus && (
                  <div className="absolute bottom-full left-0 mb-2 bg-white border border-gray-200 rounded-xl shadow-lg z-10 p-2 flex gap-2">
                    <span className="text-xs text-gray-600 flex items-center">Set to {pendingStatus}?</span>
                    <button
                      onClick={handleConfirm}
                      className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 min-h-[32px] font-semibold"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => { setPendingStatus(null); setStatusDropdownOpen(false); }}
                      className="text-xs bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-300 min-h-[32px]"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <button onClick={() => onStatusChange(candidate.id_ld, 'Passed')}
                  className={`text-sm px-4 py-2 rounded-lg font-semibold min-h-[44px] min-w-[80px] transition-colors ${
                    currentStatus === 'Passed' ? 'bg-green-600 text-white' : 'bg-green-100 text-green-700 hover:bg-green-200'
                  }`}>
                  ✓ Pass
                </button>
                <button onClick={() => onStatusChange(candidate.id_ld, 'Failed')}
                  className={`text-sm px-4 py-2 rounded-lg font-semibold min-h-[44px] min-w-[80px] transition-colors ${
                    currentStatus === 'Failed' ? 'bg-red-600 text-white' : 'bg-red-100 text-red-700 hover:bg-red-200'
                  }`}>
                  ✗ Fail
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-800">Edit Candidate Info</h3>
              <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600 text-2xl">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Full Name</label>
                <input value={form.full_name} onChange={(e) => setForm(f => ({ ...f, full_name: e.target.value }))} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Passport No</label>
                <input value={form.pp_no} onChange={(e) => setForm(f => ({ ...f, pp_no: e.target.value }))} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Date of Birth</label>
                  <input value={form.dob} onChange={(e) => setForm(f => ({ ...f, dob: e.target.value }))} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]" placeholder="dd/mm/yyyy" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Place of Birth</label>
                  <input value={form.pob} onChange={(e) => setForm(f => ({ ...f, pob: e.target.value }))} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Issued Date</label>
                  <input value={form.pp_doi} onChange={(e) => setForm(f => ({ ...f, pp_doi: e.target.value }))} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]" placeholder="dd/mm/yyyy" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Expires Date</label>
                  <input value={form.pp_doe} onChange={(e) => setForm(f => ({ ...f, pp_doe: e.target.value }))} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]" placeholder="dd/mm/yyyy" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Address</label>
                <input value={form.address} onChange={(e) => setForm(f => ({ ...f, address: e.target.value }))} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Phone</label>
                <input value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Height (ft)</label>
                  <input type="number" step="0.1" value={form.height_ft} onChange={(e) => setForm(f => ({ ...f, height_ft: e.target.value }))} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Weight (kg)</label>
                  <input type="number" step="0.1" value={form.weight_kg} onChange={(e) => setForm(f => ({ ...f, weight_kg: e.target.value }))} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]" />
                </div>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={saveEdit} disabled={saving}
                className="flex-1 text-sm bg-blue-600 text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 min-h-[44px] font-semibold">
                {saving ? '⏳ Saving...' : 'Save'}
              </button>
              <button onClick={() => setEditing(false)} disabled={saving}
                className="flex-1 text-sm bg-gray-200 text-gray-700 px-4 py-2.5 rounded-lg hover:bg-gray-300 min-h-[44px] font-semibold">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
