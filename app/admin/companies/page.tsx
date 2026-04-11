'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { Company } from '@/lib/types';
import Link from 'next/link';
import CompanyFormModal from '@/components/admin/CompanyFormModal';

interface CompanyRow extends Company {
  total_orders: number;
  active_orders: number;
  total_revenue: number;
}

function nameClass(c: CompanyRow) {
  const isMissing = !c.short_name || !c.tax_code || !c.legal_rep || !c.legal_rep_title || !c.address;
  return isMissing ? 'font-semibold text-sm text-red-600 truncate' : 'font-semibold text-sm text-slate-800 truncate';
}

function Avatar({ c }: { c: CompanyRow }) {
  const src = c.avatar_url ?? c.company_media?.[0] ?? null;
  const isMissing = !c.short_name || !c.tax_code || !c.legal_rep || !c.legal_rep_title || !c.address;
  return src ? (
    <img src={src} alt={c.company_name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
  ) : (
    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold ${isMissing ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-700'}`}>
      {(c.company_name || '?')[0].toUpperCase()}
    </div>
  );
}

function fmtVnd(val: number) {
  if (!val) return '—';
  if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(1)}B`;
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(0)}M`;
  return val.toLocaleString('vi-VN');
}

export default function CompaniesPage() {
  const router = useRouter();
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [filtered, setFiltered] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('companies')
      .select(`
        *,
        orders!orders_company_id_fkey(
          id, status, total_fee_vn
        )
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) { console.error(error); setLoading(false); return; }

    const rows: CompanyRow[] = (data ?? []).map((c: any) => {
      const orders = c.orders ?? [];
      return {
        ...c,
        company_media: c.company_media ?? [],
        doc_links: c.doc_links ?? [],
        total_orders: orders.length,
        active_orders: orders.filter((o: any) => o.status !== 'Đã tuyển đủ').length,
        total_revenue: orders.reduce((s: number, o: any) => s + (o.total_fee_vn || 0), 0),
      };
    });

    setCompanies(rows);
    setFiltered(rows);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(
      companies.filter(
        (c) =>
          c.company_name.toLowerCase().includes(q) ||
          (c.tax_code ?? '').toLowerCase().includes(q) ||
          (c.short_name ?? '').toLowerCase().includes(q),
      ),
    );
  }, [search, companies]);

  return (
    <div className="p-4 pb-24 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 pt-1">
        <div className="flex-1">
          <h1 className="text-lg font-bold text-slate-800">Công ty VN</h1>
          <p className="text-xs text-gray-400">{companies.length} công ty</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm min-h-[44px] flex items-center gap-1.5 transition-colors"
        >
          + Thêm
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm theo tên hoặc mã số thuế..."
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]"
        />
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[...Array(5)].map((_, i) => <div key={i} className="h-20 bg-gray-200 rounded-2xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-300 text-4xl mb-3">🏭</p>
          <p className="text-gray-500 text-sm">{search ? 'Không tìm thấy kết quả' : 'Chưa có công ty nào'}</p>
        </div>
      ) : (
        <>
          {/* Mobile: card list */}
          <div className="md:hidden space-y-3">
            {filtered.map((c) => (
              <Link
                key={c.id}
                href={`/admin/companies/${c.id}`}
                className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow active:scale-[0.99]"
              >
                <Avatar c={c} />
                <div className="flex-1 min-w-0">
                  <p className={nameClass(c)}>{c.company_name}</p>
                  {c.tax_code && <p className="text-xs text-gray-400">MST: {c.tax_code}</p>}
                  {c.legal_rep && <p className="text-xs text-gray-400 truncate">ĐD: {c.legal_rep}</p>}
                </div>
                <div className="text-right flex-shrink-0">
                  {c.active_orders > 0 && (
                    <span className="inline-block text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                      {c.active_orders} đơn đang tuyển
                    </span>
                  )}
                  {c.total_orders === 0 && (
                    <span className="inline-block text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">Chưa có đơn</span>
                  )}
                  {c.total_revenue > 0 && (
                    <p className="text-xs text-blue-600 font-semibold mt-1">{fmtVnd(c.total_revenue)} ₫</p>
                  )}
                </div>
              </Link>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden md:block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Công ty', 'MST', 'Người ĐD', 'Đơn hàng', 'Doanh thu', ''].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar c={c} />
                        <div>
                          <p className={nameClass(c)}>{c.company_name}</p>
                          {c.short_name && <p className="text-xs text-gray-400">{c.short_name}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{c.tax_code || '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      <p>{c.legal_rep || '—'}</p>
                      {c.legal_rep_title && <p className="text-gray-400">{c.legal_rep_title}</p>}
                    </td>
                    <td className="px-4 py-3">
                      {c.active_orders > 0 ? (
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">{c.active_orders} đang tuyển</span>
                      ) : (
                        <span className="text-xs text-gray-400">{c.total_orders} đơn</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-blue-600">{fmtVnd(c.total_revenue)} {c.total_revenue > 0 ? '₫' : ''}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/companies/${c.id}`}
                        className="text-xs text-blue-600 hover:underline font-medium"
                      >
                        Xem →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showModal && (
        <CompanyFormModal
          onClose={() => setShowModal(false)}
          onSaved={(company, andAddOrder) => {
            setShowModal(false);
            if (andAddOrder) {
              router.push(`/admin/companies/${company.id}?addOrder=1`);
            } else {
              load();
            }
          }}
        />
      )}
    </div>
  );
}
