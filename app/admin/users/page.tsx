'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import AddAgentModal from '@/components/admin/AddAgentModal';

type RoleFilter = 'all' | 'agent' | 'manager' | 'operator' | 'admin' | 'inactive';

interface UserRow {
  id: string;
  full_name: string | null;
  short_name: string | null;
  role: string | null;
  status?: string | null;
  agency_id?: string | null;
}

function RolePill({ role }: { role: string | null }) {
  const map: Record<string, string> = {
    admin: 'bg-purple-100 text-purple-700',
    agent: 'bg-blue-100 text-blue-600',
    manager: 'bg-indigo-100 text-indigo-700',
    operator: 'bg-gray-100 text-gray-600',
  };
  const labels: Record<string, string> = { admin: 'Admin', agent: 'Agent', manager: 'Manager', operator: 'Operator' };
  const cls = map[role || ''] || 'bg-gray-100 text-gray-600';
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${cls}`}>{labels[role || ''] || role || '—'}</span>;
}

const ROLE_FILTERS: { key: RoleFilter; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'agent', label: 'Agent' },
  { key: 'manager', label: 'Manager' },
  { key: 'operator', label: 'Operator' },
  { key: 'admin', label: 'Admin' },
  { key: 'inactive', label: 'Ngừng HD' },
];

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [filtered, setFiltered] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, short_name, role, status, agency_id')
        .order('id');
      if (error) throw error;
      setUsers((data || []) as UserRow[]);
    } catch (err) {
      console.error('Error loading users:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(
      users.filter((u) => {
        const matchSearch =
          (u.full_name ?? '').toLowerCase().includes(q) ||
          (u.short_name ?? '').toLowerCase().includes(q) ||
          u.id.toLowerCase().includes(q);
        const matchRole = roleFilter === 'all'
          ? u.status !== 'inactive'
          : roleFilter === 'inactive'
            ? u.status === 'inactive'
            : u.role === roleFilter && u.status !== 'inactive';
        return matchSearch && matchRole;
      }),
    );
  }, [search, roleFilter, users]);

  const activeCount = users.filter((u) => u.status !== 'inactive').length;
  const inactiveCount = users.filter((u) => u.status === 'inactive').length;

  return (
    <div className="p-4 pb-24 space-y-4">
      <div className="flex items-center gap-3 pt-1">
        <div className="flex-1">
          <h1 className="text-lg font-bold text-slate-800">Tài khoản</h1>
          <p className="text-xs text-gray-400">{activeCount} hoạt động · {inactiveCount} ngừng</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm min-h-[44px] flex items-center gap-1.5 transition-colors"
        >
          + Thêm
        </button>
      </div>

      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm theo tên, ID..."
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {ROLE_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setRoleFilter(f.key)}
            className={`text-xs px-3 py-1.5 rounded-full font-medium whitespace-nowrap transition-colors min-h-[36px] ${
              roleFilter === f.key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-gray-200 rounded-2xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-300 text-4xl mb-3">🔑</p>
          <p className="text-gray-500 text-sm">{search || roleFilter !== 'all' ? 'Không tìm thấy kết quả' : 'Chưa có tài khoản nào'}</p>
        </div>
      ) : (
        <>
          <div className="md:hidden space-y-3">
            {filtered.map((u) => (
              <Link
                key={u.id}
                href={`/admin/agents/${u.id}`}
                className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow active:scale-[0.99]"
              >
                <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${u.status === 'inactive' ? 'bg-red-100 text-red-400' : u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                  {(u.short_name || u.full_name || '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-slate-800 truncate">{u.full_name || u.id}</p>
                  <p className="text-xs text-gray-400 truncate">{u.id}</p>
                </div>
                <RolePill role={u.role} />
              </Link>
            ))}
          </div>

          <div className="hidden md:block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Tên', 'ID hệ thống', 'Vai trò', 'Trạng thái', ''].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${u.status === 'inactive' ? 'bg-red-100 text-red-400' : u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                          {(u.short_name || u.full_name || '?')[0].toUpperCase()}
                        </div>
                        <span className="font-medium text-slate-800">{u.full_name || '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{u.id}</td>
                    <td className="px-4 py-3"><RolePill role={u.role} /></td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.status === 'inactive' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'}`}>
                        {u.status === 'inactive' ? 'Ngừng HD' : 'Hoạt động'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/agents/${u.id}`} className="text-xs text-blue-600 hover:underline font-medium">Xem →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showModal && (
        <AddAgentModal
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            load();
          }}
          showRoleSelector
          showAgencySelector
        />
      )}
    </div>
  );
}
