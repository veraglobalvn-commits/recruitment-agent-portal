'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { fmtVND, fmtVndShort } from '@/lib/formatters';
import type { FinanceCategory, FinanceTransaction } from '@/lib/types';

interface AdminUser { id: string; name: string }

type TxnForm = {
  type: 'income' | 'expense';
  amount: string;
  category_id: string;
  newCategoryName: string;
  description: string;
  date: string;
  note: string;
  receipt_url: string | null;
};

function emptyForm(type: 'income' | 'expense' = 'income'): TxnForm {
  return {
    type,
    amount: '',
    category_id: '',
    newCategoryName: '',
    description: '',
    date: new Date().toISOString().slice(0, 10),
    note: '',
    receipt_url: null,
  };
}

function TypePill({ type }: { type: 'income' | 'expense' }) {
  return type === 'income'
    ? <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Thu</span>
    : <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">Chi</span>;
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className={`bg-white rounded-2xl border shadow-sm p-4 border-${color}-100`}>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-base font-bold text-${color}-700 truncate`}>{value}</p>
    </div>
  );
}

export default function FinancePage() {
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);

  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [filterCat, setFilterCat] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editingTxn, setEditingTxn] = useState<FinanceTransaction | null>(null);
  const [form, setForm] = useState<TxnForm>(emptyForm());
  const [showNewCat, setShowNewCat] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user.id) {
        const { data: ud } = await supabase.from('users').select('id, full_name').eq('supabase_uid', session.user.id).maybeSingle();
        if (ud) setAdminUser({ id: ud.id, name: ud.full_name || ud.id });
      }
      const [txnRes, catRes] = await Promise.all([
        supabase.from('finance_transactions').select('*').order('date', { ascending: false }).order('created_at', { ascending: false }),
        supabase.from('finance_categories').select('*').order('name'),
      ]);
      setTransactions((txnRes.data ?? []) as FinanceTransaction[]);
      setCategories((catRes.data ?? []) as FinanceCategory[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setEditingTxn(null);
    setForm(emptyForm());
    setShowNewCat(false);
    setShowModal(true);
  };

  const openEdit = (t: FinanceTransaction) => {
    setEditingTxn(t);
    setForm({
      type: t.type,
      amount: String(t.amount),
      category_id: t.category_id ?? '',
      newCategoryName: '',
      description: t.description ?? '',
      date: t.date,
      note: t.note ?? '',
      receipt_url: t.receipt_url,
    });
    setShowNewCat(false);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingTxn(null);
    setForm(emptyForm());
    setShowNewCat(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const tempId = editingTxn?.id ?? 'new_' + Date.now();
      const path = `finance/${tempId}/receipt_${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('agent-media').upload(path, file, { cacheControl: '3600', upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('agent-media').getPublicUrl(path);
      setForm(f => ({ ...f, receipt_url: urlData.publicUrl }));
    } catch (err) {
      alert(`Upload thất bại: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const ensureCategory = async (): Promise<string | null> => {
    if (!showNewCat || !form.newCategoryName.trim()) return form.category_id || null;
    const { data, error } = await supabase.from('finance_categories').insert({
      name: form.newCategoryName.trim(),
      type: form.type,
    }).select().single();
    if (error || !data) return form.category_id || null;
    const newCat = data as FinanceCategory;
    setCategories(cs => [...cs, newCat]);
    return newCat.id;
  };

  const handleSave = async () => {
    if (!form.amount || Number(form.amount) <= 0 || !form.date) return;
    setSaving(true);
    try {
      const categoryId = await ensureCategory();
      const catName = showNewCat && form.newCategoryName.trim()
        ? form.newCategoryName.trim()
        : categories.find(c => c.id === categoryId)?.name ?? null;

      const payload = {
        type: form.type,
        amount: Number(form.amount),
        category_id: categoryId || null,
        category_name: catName,
        description: form.description.trim() || null,
        date: form.date,
        user_id: adminUser?.id ?? null,
        user_name: adminUser?.name ?? null,
        receipt_url: form.receipt_url,
        note: form.note.trim() || null,
      };

      if (editingTxn) {
        const { data, error } = await supabase.from('finance_transactions').update(payload).eq('id', editingTxn.id).select().single();
        if (error) throw error;
        setTransactions(ts => ts.map(t => t.id === editingTxn.id ? data as FinanceTransaction : t));
      } else {
        const { data, error } = await supabase.from('finance_transactions').insert(payload).select().single();
        if (error) throw error;
        setTransactions(ts => [data as FinanceTransaction, ...ts]);
      }
      closeModal();
    } catch (err) {
      alert(`Lỗi: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (txn: FinanceTransaction) => {
    if (!confirm('Xoá khoản này?')) return;
    if (txn.receipt_url) {
      const path = txn.receipt_url.split('/agent-media/')[1];
      if (path) await supabase.storage.from('agent-media').remove([path]);
    }
    await supabase.from('finance_transactions').delete().eq('id', txn.id);
    setTransactions(ts => ts.filter(t => t.id !== txn.id));
  };

  const filteredCats = categories.filter(c => c.type === form.type);

  const displayed = transactions.filter(t => {
    if (filterType !== 'all' && t.type !== filterType) return false;
    if (filterCat && t.category_id !== filterCat) return false;
    if (filterFrom && t.date < filterFrom) return false;
    if (filterTo && t.date > filterTo) return false;
    return true;
  });

  const totalIncome = displayed.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const totalExpense = displayed.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const balance = totalIncome - totalExpense;

  return (
    <div className="p-4 pb-24 space-y-4">
      <input type="file" ref={fileRef} onChange={handleFileUpload} accept="image/*,.pdf" className="hidden" />

      <div className="flex items-center gap-3 pt-1">
        <div className="flex-1">
          <h1 className="text-lg font-bold text-slate-800">Quản lý tài chính</h1>
          <p className="text-xs text-gray-400">{displayed.length} giao dịch</p>
        </div>
        <button onClick={openAdd} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-xl min-h-[40px]">
          + Thêm
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Tổng thu" value={fmtVndShort(totalIncome) + ' ₫'} color="green" />
        <StatCard label="Tổng chi" value={fmtVndShort(totalExpense) + ' ₫'} color="red" />
        <StatCard label="Số dư" value={fmtVndShort(balance) + ' ₫'} color={balance >= 0 ? 'blue' : 'orange'} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select value={filterType} onChange={e => setFilterType(e.target.value as 'all' | 'income' | 'expense')}
          className="text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400">
          <option value="all">Tất cả</option>
          <option value="income">Thu</option>
          <option value="expense">Chi</option>
        </select>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400">
          <option value="">Tất cả danh mục</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name} ({c.type === 'income' ? 'Thu' : 'Chi'})</option>)}
        </select>
        <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="Từ ngày" />
        <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="Đến ngày" />
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-gray-200 rounded-2xl" />)}
        </div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-300 text-4xl mb-3">💵</p>
          <p className="text-gray-500 text-sm">Chưa có giao dịch nào</p>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {displayed.map(t => (
              <div key={t.id} className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <TypePill type={t.type} />
                    {t.category_name && <span className="text-xs text-gray-500">{t.category_name}</span>}
                    {t.order_payment_id && <span className="text-xs px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded-full">📎 Công nợ</span>}
                  </div>
                  <p className={`text-sm font-bold whitespace-nowrap ${t.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                    {t.type === 'income' ? '+' : '-'}{fmtVND(t.amount)} ₫
                  </p>
                </div>
                {t.description && <p className="text-xs text-gray-600 truncate mb-1">{t.description}</p>}
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-400">{t.date} {t.user_name && `· ${t.user_name}`}</p>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(t)} className="text-gray-400 hover:text-blue-600 p-1.5 rounded-lg hover:bg-blue-50">✏️</button>
                    <button onClick={() => handleDelete(t)} className="text-gray-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50">🗑️</button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['Ngày', 'Loại', 'Danh mục', 'Mô tả', 'Số tiền', 'Người TH', 'Ghi chú', ''].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {displayed.map(t => (
                    <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{t.date}</td>
                      <td className="px-4 py-3"><TypePill type={t.type} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-gray-600">{t.category_name || '—'}</span>
                          {t.order_payment_id && <span className="text-xs px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded-full">📎 Công nợ</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-700 max-w-[200px] truncate">{t.description || '—'}</td>
                      <td className={`px-4 py-3 text-xs font-bold whitespace-nowrap ${t.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                        {t.type === 'income' ? '+' : '-'}{fmtVND(t.amount)} ₫
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{t.user_name || '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-400 max-w-[120px] truncate">{t.note || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => openEdit(t)} className="text-gray-400 hover:text-blue-600 p-1.5 rounded-lg hover:bg-blue-50">✏️</button>
                          <button onClick={() => handleDelete(t)} className="text-gray-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50">🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100 flex-shrink-0">
              <p className="text-sm font-bold text-slate-800">{editingTxn ? 'Sửa giao dịch' : 'Thêm giao dịch'}</p>
              <button onClick={closeModal} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 text-lg">✕</button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
              {/* Type */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Loại *</label>
                <div className="flex gap-2">
                  {(['income', 'expense'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => { setForm(f => ({ ...f, type: t, category_id: '' })); setShowNewCat(false); }}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${form.type === t
                        ? t === 'income' ? 'bg-green-600 text-white border-green-600' : 'bg-red-600 text-white border-red-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
                    >
                      {t === 'income' ? 'Thu' : 'Chi'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Số tiền (VNĐ) *</label>
                <input
                  type="number"
                  min="1"
                  placeholder="0"
                  value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Danh mục</label>
                {!showNewCat ? (
                  <div className="flex gap-2">
                    <select
                      value={form.category_id}
                      onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
                      className="flex-1 px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]"
                    >
                      <option value="">-- Chọn danh mục --</option>
                      {filteredCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowNewCat(true)}
                      className="px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200 whitespace-nowrap"
                    >
                      ＋ Mới
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      autoFocus
                      placeholder="Tên danh mục mới..."
                      value={form.newCategoryName}
                      onChange={e => setForm(f => ({ ...f, newCategoryName: e.target.value }))}
                      className="flex-1 px-3 py-2.5 border border-blue-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]"
                    />
                    <button type="button" onClick={() => setShowNewCat(false)} className="px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg border border-gray-200">Huỷ</button>
                  </div>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Mô tả</label>
                <input
                  type="text"
                  placeholder="Mô tả ngắn..."
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]"
                />
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Ngày *</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]"
                />
              </div>

              {/* Receipt */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Ảnh / Tài liệu đính kèm</label>
                {form.receipt_url ? (
                  <div className="flex items-center gap-2 p-2 bg-green-50 rounded-lg">
                    <span className="text-xs text-green-700 flex-1 truncate">✅ Đã tải lên</span>
                    <a href={form.receipt_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">Xem</a>
                    <button type="button" onClick={() => setForm(f => ({ ...f, receipt_url: null }))} className="text-xs text-red-500 hover:text-red-700">Xoá</button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="w-full py-2.5 border-2 border-dashed border-gray-200 rounded-lg text-xs text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors disabled:opacity-50 min-h-[44px]"
                  >
                    {uploading ? 'Đang tải...' : '📎 Chọn file (ảnh / PDF)'}
                  </button>
                )}
              </div>

              {/* Note */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Ghi chú</label>
                <textarea
                  rows={2}
                  placeholder="Ghi chú thêm..."
                  value={form.note}
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                />
              </div>
            </div>

            <div className="px-5 pb-5 pt-3 border-t border-gray-100 flex-shrink-0 flex gap-3">
              <button onClick={closeModal} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 rounded-xl text-sm min-h-[44px]">Huỷ</button>
              <button
                onClick={handleSave}
                disabled={saving || !form.amount || Number(form.amount) <= 0 || !form.date}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl text-sm min-h-[44px] disabled:opacity-50"
              >
                {saving ? 'Đang lưu...' : editingTxn ? 'Cập nhật' : 'Thêm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
