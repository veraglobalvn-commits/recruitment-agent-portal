'use client';

import { useState, useRef } from 'react';
import type { Candidate } from '@/lib/types';
import { supabase } from '@/lib/supabase';

interface CandidateCardProps {
  candidate: Candidate;
  orderId: string;
  onVideoUploadClick: (id: string) => void;
  onCandidateUpdate: (id: string, updates: Partial<Candidate>) => void;
  isVideoUploading: boolean;
  onStatusChange?: (id: string, status: 'Passed' | 'Failed') => void;
  currentStatus?: string | null;
}

export default function CandidateCard({
  candidate,
  orderId,
  onVideoUploadClick,
  onCandidateUpdate,
  isVideoUploading,
  onStatusChange,
  currentStatus,
}: CandidateCardProps) {

  const [photoUploading, setPhotoUploading] = useState(false);
  const [pccUploading, setPccUploading] = useState(false);
  const [savingMeasurements, setSavingMeasurements] = useState(false);
  const [height, setHeight] = useState<string>(candidate.height_ft?.toString() ?? '');
  const [weight, setWeight] = useState<string>(candidate.weight_kg?.toString() ?? '');

  const photoInputRef = useRef<HTMLInputElement>(null);
  const pccInputRef = useRef<HTMLInputElement>(null);

  const safeId = candidate.id_ld.replace(/[^a-zA-Z0-9-]/g, '_');
  const safeOrder = orderId.replace(/[^a-zA-Z0-9-]/g, '_');

  // ── Upload helper (Supabase Storage → n8n → Lark) ──
  const uploadFile = async (
    file: File,
    pathPrefix: string,
    field: 'photo_link' | 'pcc_health_cert_link',
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

      // Update Supabase
      const { error: dbErr } = await supabase
        .from('candidates')
        .update({ [field]: publicUrl })
        .eq('id_ld', candidate.id_ld);
      if (dbErr) throw new Error(`DB: ${dbErr.message}`);

      // Sync to Lark via n8n
      const n8nUrl = process.env.NEXT_PUBLIC_N8N_VIDEO_UPDATE_URL;
      if (n8nUrl) {
        fetch(n8nUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ candidate_id: candidate.id_ld, [field]: publicUrl }),
        }).catch(() => {}); // fire-and-forget, don't block
      }

      onCandidateUpdate(candidate.id_ld, { [field]: publicUrl });
    } catch (err) {
      console.error('Upload failed:', err);
      alert(`Lỗi upload: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUploading(false);
    }
  };

  const saveMeasurements = async () => {
    setSavingMeasurements(true);
    const updates: Partial<Candidate> = {
      height_ft: height ? parseFloat(height) : null,
      weight_kg: weight ? parseFloat(weight) : null,
    };
    try {
      const { error } = await supabase
        .from('candidates')
        .update({ height_ft: updates.height_ft, weight_kg: updates.weight_kg })
        .eq('id_ld', candidate.id_ld);
      if (error) throw new Error(error.message);

      const n8nUrl = process.env.NEXT_PUBLIC_N8N_VIDEO_UPDATE_URL;
      if (n8nUrl) {
        fetch(n8nUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            candidate_id: candidate.id_ld,
            height_ft: updates.height_ft,
            weight_kg: updates.weight_kg,
          }),
        }).catch(() => {}); // fire-and-forget
      }
      onCandidateUpdate(candidate.id_ld, updates);
    } catch (err) {
      alert(`Lưu thất bại: ${err instanceof Error ? err.message : String(err)}`);
      console.error('Save measurements failed:', err);
    } finally {
      setSavingMeasurements(false);
    }
  };

  return (
    <div className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow bg-white">
      {/* Header: Photo + Name + ID */}
      <div className="flex items-start gap-3 mb-3">
        {/* Thumbnail */}
        <div className="relative flex-shrink-0">
          {candidate.photo_link ? (
            <img
              src={candidate.photo_link}
              alt={candidate.full_name ?? ''}
              className="w-14 h-14 rounded-full object-cover border-2 border-gray-200"
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center border-2 border-dashed border-gray-300">
              <span className="text-gray-400 text-xs text-center leading-tight">No<br/>Photo</span>
            </div>
          )}
          <button
            onClick={() => photoInputRef.current?.click()}
            disabled={photoUploading}
            title="Upload candidate photo"
            className="absolute -bottom-1 -right-1 w-5 h-5 bg-blue-600 text-white rounded-full text-xs flex items-center justify-center hover:bg-blue-700 disabled:opacity-50"
          >
            {photoUploading ? '…' : '📷'}
          </button>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadFile(file, 'photo', 'photo_link', setPhotoUploading);
              e.target.value = '';
            }}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start gap-1">
            <h3 className="font-bold text-gray-800 text-sm leading-tight">{candidate.full_name || 'N/A'}</h3>
            <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded flex-shrink-0">
              {candidate.id_ld}
            </span>
          </div>
          {/* Passport fields */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-gray-600 mt-1.5">
            <p>PP: <span className="font-semibold text-gray-800">{candidate.pp_no || 'N/A'}</span></p>
            <p>DOB: <span className="font-semibold text-gray-800">{candidate.dob || 'N/A'}</span></p>
            <p>Issued: <span className="font-semibold text-gray-800">{candidate.pp_doi || 'N/A'}</span></p>
            <p>Exp: <span className="font-semibold text-gray-800">{candidate.pp_doe || 'N/A'}</span></p>
            {candidate.pob && <p className="col-span-2">POB: <span className="font-semibold text-gray-800">{candidate.pob}</span></p>}
            {candidate.phone && <p className="col-span-2">📞 <span className="font-semibold text-gray-800">{candidate.phone}</span></p>}
          </div>
        </div>
      </div>

      {/* Measurements */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Height (ft)</label>
          <input
            type="number" step="0.1" placeholder="5.6"
            value={height} onChange={(e) => setHeight(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-2 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Weight (kg)</label>
          <input
            type="number" step="0.1" placeholder="65"
            value={weight} onChange={(e) => setWeight(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-2 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]"
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={saveMeasurements} disabled={savingMeasurements}
            className="w-full text-sm bg-slate-800 text-white px-2 py-2.5 rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors min-h-[44px]"
          >
            {savingMeasurements ? '…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Action Buttons — 2 rows on mobile */}
      <div className="space-y-2">
        {/* Row 1: Docs */}
        <div className="flex flex-wrap gap-2">
          {candidate.passport_link ? (
            <a href={candidate.passport_link} target="_blank" rel="noopener noreferrer"
              className="text-xs bg-gray-100 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-200 min-h-[44px] flex items-center">
              🪪 Passport
            </a>
          ) : (
            <span className="text-xs bg-gray-50 text-gray-400 px-3 py-2 rounded-lg border border-dashed min-h-[44px] flex items-center">No Passport</span>
          )}

          {candidate.video_link ? (
            <a href={candidate.video_link} target="_blank" rel="noopener noreferrer"
              className="text-xs bg-blue-100 text-blue-700 px-3 py-2 rounded-lg hover:bg-blue-200 min-h-[44px] flex items-center font-semibold">
              ▶ Video
            </a>
          ) : isVideoUploading ? (
            <button disabled className="text-xs border border-blue-300 text-blue-400 px-3 py-2 rounded-lg min-h-[44px] flex items-center gap-1 cursor-not-allowed">
              <span className="inline-block w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              Uploading
            </button>
          ) : (
            <button onClick={() => onVideoUploadClick(candidate.id_ld)}
              className="text-xs border border-blue-600 text-blue-600 px-3 py-2 rounded-lg hover:bg-blue-50 min-h-[44px] flex items-center gap-1">
              + Video
            </button>
          )}

          {candidate.pcc_health_cert_link ? (
            <a href={candidate.pcc_health_cert_link} target="_blank" rel="noopener noreferrer"
              className="text-xs bg-purple-100 text-purple-700 px-3 py-2 rounded-lg hover:bg-purple-200 min-h-[44px] flex items-center font-semibold"
              title="PCC & Health Cert">
              📋 PCC Doc
            </a>
          ) : pccUploading ? (
            <button disabled className="text-xs border border-purple-300 text-purple-400 px-3 py-2 rounded-lg min-h-[44px] flex items-center gap-1 cursor-not-allowed"
              title="PCC & Health Cert">
              <span className="inline-block w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
              Uploading
            </button>
          ) : (
            <button
              onClick={() => pccInputRef.current?.click()}
              className="text-xs border border-purple-600 text-purple-600 px-3 py-2 rounded-lg hover:bg-purple-50 min-h-[44px] flex items-center gap-1"
              title="PCC & Health Cert"
            >
              + PCC & Health Cert
            </button>
          )}
          <input ref={pccInputRef} type="file" accept="image/*,application/pdf" capture="environment"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f, 'pcc', 'pcc_health_cert_link', setPccUploading); e.target.value = ''; }}
          />
        </div>

        {/* Row 2: Status */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 flex-1">Visa: {candidate.visa_status || 'Pending'}</span>
          {onStatusChange ? (
            <>
              <button
                onClick={() => onStatusChange(candidate.id_ld, 'Passed')}
                className={`text-sm px-4 py-2 rounded-lg font-semibold min-h-[44px] min-w-[80px] transition-colors ${
                  currentStatus === 'Passed' ? 'bg-green-600 text-white' : 'bg-green-100 text-green-700 hover:bg-green-200'
                }`}
              >
                ✓ Pass
              </button>
              <button
                onClick={() => onStatusChange(candidate.id_ld, 'Failed')}
                className={`text-sm px-4 py-2 rounded-lg font-semibold min-h-[44px] min-w-[80px] transition-colors ${
                  currentStatus === 'Failed' ? 'bg-red-600 text-white' : 'bg-red-100 text-red-700 hover:bg-red-200'
                }`}
              >
                ✗ Fail
              </button>
            </>
          ) : candidate.interview_status ? (
            <span
              className={`text-sm px-4 py-2 rounded-lg font-semibold min-h-[44px] min-w-[80px] flex items-center justify-center ${
                candidate.interview_status === 'Passed'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-red-100 text-red-700'
              }`}
            >
              {candidate.interview_status === 'Passed' ? '✓ Passed' : '✗ Failed'}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
