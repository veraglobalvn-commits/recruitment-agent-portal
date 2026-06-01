'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { JobIndustry, JobPosition } from '@/lib/types';

type NewIndustryForm = {
  name_vi: string;
  name_en: string;
};

type NewPositionForm = {
  industry_id: string;
  name_vi: string;
  name_en: string;
  description_en: string;
  default_weight_percent: string;
};

const inputCls = 'w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]';

function positionName(position: JobPosition) {
  return position.name_vi || position.name || '—';
}

export default function JobPositionsPage() {
  const [industries, setIndustries] = useState<JobIndustry[]>([]);
  const [selectedIndustryId, setSelectedIndustryId] = useState('');
  const [industryForm, setIndustryForm] = useState<NewIndustryForm>({ name_vi: '', name_en: '' });
  const [editingIndustryId, setEditingIndustryId] = useState('');
  const [positionForm, setPositionForm] = useState<NewPositionForm>({
    industry_id: '',
    name_vi: '',
    name_en: '',
    description_en: '',
    default_weight_percent: '',
  });
  const [editingPositionId, setEditingPositionId] = useState('');
  const [positionEditForm, setPositionEditForm] = useState<NewPositionForm>({
    industry_id: '',
    name_vi: '',
    name_en: '',
    description_en: '',
    default_weight_percent: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const selectedIndustry = useMemo(
    () => industries.find((industry) => industry.id === selectedIndustryId) ?? industries[0] ?? null,
    [industries, selectedIndustryId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Chưa đăng nhập');

      const res = await fetch('/api/admin/job-positions', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json() as { industries?: JobIndustry[]; error?: string };
      if (!res.ok) throw new Error(json.error || 'Không tải được danh mục');

      const data = json.industries ?? [];
      setIndustries(data);
      setSelectedIndustryId((current) => current || data[0]?.id || '');
      setPositionForm((current) => ({ ...current, industry_id: current.industry_id || data[0]?.id || '' }));
    } catch (err) {
      setMsg(`❌ ${err instanceof Error ? err.message : 'Không tải được danh mục'}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!selectedIndustryId && industries[0]?.id) setSelectedIndustryId(industries[0].id);
  }, [industries, selectedIndustryId]);

  const saveCatalog = useCallback(async (method: 'POST' | 'PATCH', body: Record<string, unknown>) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Chưa đăng nhập');

    const res = await fetch('/api/admin/job-positions', {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
    });
    const json = await res.json() as { error?: string };
    if (!res.ok) throw new Error(json.error || 'Không lưu được danh mục');
  }, []);

  const resetIndustryForm = useCallback(() => {
    setEditingIndustryId('');
    setIndustryForm({ name_vi: '', name_en: '' });
  }, []);

  const resetPositionForm = useCallback((industryId = selectedIndustry?.id || '') => {
    setEditingPositionId('');
    setPositionEditForm({
      industry_id: '',
      name_vi: '',
      name_en: '',
      description_en: '',
      default_weight_percent: '',
    });
    setPositionForm({
      industry_id: industryId,
      name_vi: '',
      name_en: '',
      description_en: '',
      default_weight_percent: '',
    });
  }, [selectedIndustry?.id]);

  const handleSaveIndustry = useCallback(async () => {
    const nameVi = industryForm.name_vi.trim();
    if (!nameVi) {
      setMsg('❌ Tên ngành nghề là bắt buộc');
      return;
    }

    setSaving(true);
    setMsg(null);
    try {
      await saveCatalog(editingIndustryId ? 'PATCH' : 'POST', {
        type: 'industry',
        id: editingIndustryId || undefined,
        name_vi: nameVi,
        name_en: industryForm.name_en.trim() || null,
      });
      resetIndustryForm();
      setMsg(editingIndustryId ? '✅ Đã cập nhật ngành nghề' : '✅ Đã thêm ngành nghề');
      await load();
    } catch (err) {
      setMsg(`❌ ${err instanceof Error ? err.message : 'Không lưu được ngành nghề'}`);
    } finally {
      setSaving(false);
    }
  }, [editingIndustryId, industryForm, load, resetIndustryForm, saveCatalog]);

  const handleSavePosition = useCallback(async () => {
    const industryId = positionForm.industry_id || selectedIndustry?.id || '';
    const nameVi = positionForm.name_vi.trim();
    if (!industryId) {
      setMsg('❌ Chọn ngành nghề trước');
      return;
    }
    if (!nameVi) {
      setMsg('❌ Tên vị trí là bắt buộc');
      return;
    }

    setSaving(true);
    setMsg(null);
    try {
      await saveCatalog('POST', {
        type: 'position',
        industry_id: industryId,
        name_vi: nameVi,
        name_en: positionForm.name_en.trim() || null,
        description_en: positionForm.description_en.trim() || null,
        default_weight_percent: positionForm.default_weight_percent || 0,
      });
      resetPositionForm(industryId);
      setMsg('✅ Đã thêm vị trí');
      await load();
    } catch (err) {
      setMsg(`❌ ${err instanceof Error ? err.message : 'Không lưu được vị trí'}`);
    } finally {
      setSaving(false);
    }
  }, [load, positionForm, resetPositionForm, saveCatalog, selectedIndustry?.id]);

  const startEditPosition = useCallback((position: JobPosition) => {
    setEditingPositionId(position.id);
    setPositionEditForm({
      industry_id: position.industry_id || selectedIndustry?.id || '',
      name_vi: position.name_vi || position.name || '',
      name_en: position.name_en || '',
      description_en: position.description_en || '',
      default_weight_percent: String(position.default_weight_percent ?? ''),
    });
  }, [selectedIndustry?.id]);

  const handleUpdatePosition = useCallback(async (positionId: string) => {
    const industryId = positionEditForm.industry_id || selectedIndustry?.id || '';
    const nameVi = positionEditForm.name_vi.trim();
    if (!industryId) {
      setMsg('❌ Chọn ngành nghề trước');
      return;
    }
    if (!nameVi) {
      setMsg('❌ Tên vị trí là bắt buộc');
      return;
    }

    setSaving(true);
    setMsg(null);
    try {
      await saveCatalog('PATCH', {
        type: 'position',
        id: positionId,
        industry_id: industryId,
        name_vi: nameVi,
        name_en: positionEditForm.name_en.trim() || null,
        description_en: positionEditForm.description_en.trim() || null,
        default_weight_percent: positionEditForm.default_weight_percent || 0,
      });
      resetPositionForm(industryId);
      setMsg('✅ Đã cập nhật vị trí');
      await load();
    } catch (err) {
      setMsg(`❌ ${err instanceof Error ? err.message : 'Không cập nhật được vị trí'}`);
    } finally {
      setSaving(false);
    }
  }, [load, positionEditForm, resetPositionForm, saveCatalog, selectedIndustry?.id]);

  const handleTogglePositionActive = useCallback(async (position: JobPosition, isActive: boolean) => {
    setSaving(true);
    setMsg(null);
    try {
      await saveCatalog('PATCH', {
        type: 'position',
        id: position.id,
        is_active: isActive,
      });
      if (editingPositionId === position.id) resetPositionForm(position.industry_id || selectedIndustry?.id || '');
      setMsg(isActive ? '✅ Đã bật lại vị trí' : '✅ Đã ẩn vị trí');
      await load();
    } catch (err) {
      setMsg(`❌ ${err instanceof Error ? err.message : 'Không cập nhật được trạng thái vị trí'}`);
    } finally {
      setSaving(false);
    }
  }, [editingPositionId, load, resetPositionForm, saveCatalog, selectedIndustry?.id]);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Vị trí tuyển dụng</h1>
          <p className="text-sm text-gray-500 mt-1">Quản lý ngành nghề và vị trí dùng chung cho đơn hàng.</p>
        </div>
        {msg && <div className={`text-sm font-medium ${msg.startsWith('❌') ? 'text-red-600' : 'text-green-600'}`}>{msg}</div>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
        <section className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-slate-700">Ngành nghề</h2>
          </div>
          <div className="p-4 space-y-3">
            <input
              value={industryForm.name_vi}
              onChange={(e) => setIndustryForm((current) => ({ ...current, name_vi: e.target.value }))}
              className={inputCls}
              placeholder="Tên ngành nghề VI"
            />
            <input
              value={industryForm.name_en}
              onChange={(e) => setIndustryForm((current) => ({ ...current, name_en: e.target.value }))}
              className={inputCls}
              placeholder="Industry name EN"
            />
            <button
              onClick={handleSaveIndustry}
              disabled={saving || !industryForm.name_vi.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg min-h-[44px]"
            >
              {editingIndustryId ? 'Cập nhật ngành nghề' : 'Thêm ngành nghề'}
            </button>
            {editingIndustryId && (
              <button
                onClick={resetIndustryForm}
                disabled={saving}
                className="w-full border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-semibold rounded-lg min-h-[44px]"
              >
                Hủy sửa ngành nghề
              </button>
            )}

            <div className="pt-2 space-y-2">
              {loading ? (
                <p className="text-sm text-gray-400 text-center py-6">Đang tải...</p>
              ) : industries.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">Chưa có ngành nghề</p>
              ) : industries.map((industry) => (
                <div
                  key={industry.id}
                  className={`rounded-lg border px-3 py-2.5 ${selectedIndustry?.id === industry.id ? 'border-blue-300 bg-blue-50' : 'border-gray-100 hover:bg-gray-50'}`}
                >
                  <button
                    onClick={() => {
                      setSelectedIndustryId(industry.id);
                      setPositionForm((current) => ({ ...current, industry_id: industry.id }));
                    }}
                    className="w-full text-left"
                  >
                    <span className="block text-sm font-semibold text-slate-800">{industry.name_vi}</span>
                    <span className="block text-xs text-gray-500">{industry.name_en || 'Chưa có EN'} · {industry.positions?.length ?? 0} vị trí</span>
                  </button>
                  <button
                    onClick={() => {
                      setEditingIndustryId(industry.id);
                      setIndustryForm({ name_vi: industry.name_vi, name_en: industry.name_en || '' });
                    }}
                    className="mt-2 text-xs font-semibold text-blue-600 hover:text-blue-700"
                  >
                    Sửa
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-slate-700">{selectedIndustry?.name_vi || 'Chọn ngành nghề'}</h2>
            <p className="text-xs text-gray-500 mt-0.5">Thêm vị trí và tỷ trọng mặc định để tham khảo khi phân bổ theo order.</p>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_140px] gap-2">
              <input
                value={positionForm.name_vi}
                onChange={(e) => setPositionForm((current) => ({ ...current, name_vi: e.target.value }))}
                className={inputCls}
                placeholder="Tên vị trí VI"
              />
              <input
                value={positionForm.name_en}
                onChange={(e) => setPositionForm((current) => ({ ...current, name_en: e.target.value }))}
                className={inputCls}
                placeholder="Position EN"
              />
              <input
                type="number"
                min="0"
                max="100"
                value={positionForm.default_weight_percent}
                onChange={(e) => setPositionForm((current) => ({ ...current, default_weight_percent: e.target.value }))}
                className={inputCls}
                placeholder="Tỷ trọng %"
              />
            </div>
            <textarea
              value={positionForm.description_en}
              onChange={(e) => setPositionForm((current) => ({ ...current, description_en: e.target.value }))}
              className={`${inputCls} min-h-[96px] resize-y`}
              placeholder="Job description EN"
            />
            <button
              onClick={handleSavePosition}
              disabled={saving || !selectedIndustry || !positionForm.name_vi.trim()}
              className="w-full sm:w-40 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg min-h-[44px]"
            >
              Thêm vị trí
            </button>

            <div className="space-y-3">
              {(selectedIndustry?.positions ?? []).length === 0 ? (
                <div className="border border-dashed border-gray-200 rounded-xl px-4 py-8 text-center text-sm text-gray-400">
                  Chưa có vị trí
                </div>
              ) : (selectedIndustry?.positions ?? []).map((position) => {
                const isEditing = editingPositionId === position.id;
                return (
                  <div key={position.id} className="border border-gray-100 rounded-xl p-4 space-y-3">
                    {isEditing ? (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_140px] gap-2">
                          <input
                            value={positionEditForm.name_vi}
                            onChange={(e) => setPositionEditForm((current) => ({ ...current, name_vi: e.target.value }))}
                            className={inputCls}
                            placeholder="Tên vị trí VI"
                          />
                          <input
                            value={positionEditForm.name_en}
                            onChange={(e) => setPositionEditForm((current) => ({ ...current, name_en: e.target.value }))}
                            className={inputCls}
                            placeholder="Position EN"
                          />
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={positionEditForm.default_weight_percent}
                            onChange={(e) => setPositionEditForm((current) => ({ ...current, default_weight_percent: e.target.value }))}
                            className={inputCls}
                            placeholder="Tỷ trọng %"
                          />
                        </div>
                        <textarea
                          value={positionEditForm.description_en}
                          onChange={(e) => setPositionEditForm((current) => ({ ...current, description_en: e.target.value }))}
                          className={`${inputCls} min-h-[96px] resize-y`}
                          placeholder="Job description EN"
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => handleUpdatePosition(position.id)}
                            disabled={saving || !positionEditForm.name_vi.trim()}
                            className="px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg min-h-[40px]"
                          >
                            Lưu
                          </button>
                          <button
                            onClick={() => resetPositionForm(position.industry_id || selectedIndustry?.id || '')}
                            disabled={saving}
                            className="px-4 border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-semibold rounded-lg min-h-[40px]"
                          >
                            Hủy
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-semibold text-slate-800">{positionName(position)}</h3>
                              <span className={`text-xs px-2 py-1 rounded-full ${position.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                {position.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">{position.name_en || 'Chưa có EN'} · Tỷ trọng {position.default_weight_percent ?? 0}%</p>
                          </div>
                          <div className="flex flex-wrap gap-2 shrink-0">
                            <button
                              onClick={() => startEditPosition(position)}
                              className="px-3 border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-semibold rounded-lg min-h-[36px]"
                            >
                              Sửa
                            </button>
                            <button
                              onClick={() => handleTogglePositionActive(position, !position.is_active)}
                              disabled={saving}
                              className={`px-3 border text-xs font-semibold rounded-lg min-h-[36px] ${position.is_active ? 'border-red-100 text-red-600 hover:bg-red-50' : 'border-green-100 text-green-700 hover:bg-green-50'}`}
                            >
                              {position.is_active ? 'Ẩn' : 'Bật lại'}
                            </button>
                          </div>
                        </div>
                        <p className="text-sm text-gray-600 whitespace-pre-wrap break-words">{position.description_en || 'Chưa có mô tả EN'}</p>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
