'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

interface TeamMember {
  id: string;
  full_name: string | null;
  short_name: string | null;
  role: string | null;
  status: string | null;
  avatar_url: string | null;
}

interface NewMemberForm {
  email: string;
  full_name: string;
}

interface EditMemberForm {
  full_name: string;
  status: string;
}

function StatusPill({ status }: { status: string | null }) {
  if (status === 'active') return <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">Active</span>;
  if (status === 'inactive') return <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-600">Inactive</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">{status || '—'}</span>;
}

export default function TeamPage() {
  const router = useRouter();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<NewMemberForm>({ email: '', full_name: '' });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [editForm, setEditForm] = useState<EditMemberForm>({ full_name: '', status: 'active' });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const loadTeam = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/'); return; }

      const res = await fetch('/api/agents/team', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json() as { members?: TeamMember[]; error?: string };
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) { router.replace('/'); return; }
        setError(data.error || 'Failed to load team');
        return;
      }
      setMembers(data.members || []);
    } catch {
      setError('Something went wrong');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { loadTeam(); }, [loadTeam]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    if (!form.email.trim() || !form.full_name.trim()) {
      setCreateError('Email and full name are required');
      return;
    }
    setCreating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/agents/team', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          email: form.email.trim(),
          full_name: form.full_name.trim(),
        }),
      });
      const data = await res.json() as { user?: TeamMember; credentials?: { email: string; password: string }; error?: string };
      if (!res.ok) {
        setCreateError(data.error || 'Failed to create account');
        return;
      }
      setCreatedCredentials(data.credentials ?? null);
      setForm({ email: '', full_name: '' });
      loadTeam();
    } catch {
      setCreateError('Something went wrong');
    } finally {
      setCreating(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/agents/team', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          memberId: editingMember.id,
          full_name: editForm.full_name.trim(),
          status: editForm.status,
        }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        setEditError(data.error || 'Update failed');
        return;
      }
      setEditingMember(null);
      loadTeam();
    } catch {
      setEditError('Something went wrong');
    } finally {
      setEditSaving(false);
    }
  };

  const openEdit = (m: TeamMember) => {
    setEditingMember(m);
    setEditForm({ full_name: m.full_name || '', status: m.status || 'active' });
    setEditError(null);
  };

  const copyCredentials = () => {
    if (!createdCredentials) return;
    navigator.clipboard.writeText(`Email: ${createdCredentials.email}\nPassword: ${createdCredentials.password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => router.back()} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-500 hover:text-gray-700">
          ←
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-slate-800">Team Members</h1>
          <p className="text-xs text-gray-400">{members.length} member{members.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => { setShowModal(true); setCreatedCredentials(null); setCreateError(null); }}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-xl text-sm min-h-[44px] flex items-center gap-1.5 transition-colors"
        >
          + Add
        </button>
      </header>

      <div className="p-4 space-y-3 pb-24">
        {loading ? (
          <div className="space-y-3 animate-pulse">
            {[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-gray-200 rounded-2xl" />)}
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-gray-500 text-sm">{error}</p>
          </div>
        ) : members.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-300 text-4xl mb-3">👥</p>
            <p className="text-gray-500 text-sm">No members yet</p>
            <p className="text-gray-400 text-xs mt-1">Add members to help manage candidates</p>
          </div>
        ) : (
          members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
              <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${m.status === 'inactive' ? 'bg-red-100 text-red-400' : 'bg-teal-100 text-teal-700'}`}>
                {(m.full_name || 'M')[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-slate-800 truncate">{m.full_name || '—'}</p>
                <p className="text-xs text-gray-400 truncate">{m.role || 'member'}</p>
              </div>
              <StatusPill status={m.status} />
              <button
                onClick={() => openEdit(m)}
                className="text-xs text-blue-600 hover:text-blue-800 px-3 py-2 rounded-lg hover:bg-blue-50 min-h-[44px] flex items-center transition-colors flex-shrink-0"
              >
                Edit
              </button>
            </div>
          ))
        )}
      </div>

      {/* Add Member Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-md p-6">
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4 sm:hidden" />

            {createdCredentials ? (
              <div className="space-y-4">
                <h2 className="text-base font-bold text-slate-800 text-center">Account Created</h2>
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
                  <p className="text-sm"><span className="text-gray-500">Email:</span> <span className="font-semibold">{createdCredentials.email}</span></p>
                  <p className="text-sm"><span className="text-gray-500">Temp password:</span> <span className="font-mono font-semibold">{createdCredentials.password}</span></p>
                </div>
                <p className="text-xs text-orange-600 bg-orange-50 p-3 rounded-lg">Save this now. The temporary password is shown only once.</p>
                <button onClick={copyCredentials} className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 rounded-xl text-sm min-h-[44px] transition-colors">
                  {copied ? '✓ Copied' : 'Copy credentials'}
                </button>
                <button onClick={() => setShowModal(false)} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl text-sm min-h-[44px] transition-colors">
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleCreate} className="space-y-4">
                <h2 className="text-base font-bold text-slate-800">Add Member</h2>

                {createError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{createError}</div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                  <input type="text" value={form.full_name} onChange={(e) => setForm(f => ({ ...f, full_name: e.target.value }))} required className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]" placeholder="Nguyen Van A" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input type="email" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} required className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]" placeholder="email@example.com" />
                </div>

                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-3 rounded-xl text-sm font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 min-h-[44px] transition-colors">
                    Cancel
                  </button>
                  <button type="submit" disabled={creating} className="flex-1 py-3 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white min-h-[44px] disabled:opacity-50 transition-colors">
                    {creating ? 'Creating...' : 'Create account'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Edit Member Modal */}
      {editingMember && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-md p-6">
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4 sm:hidden" />
            <form onSubmit={handleEdit} className="space-y-4">
              <h2 className="text-base font-bold text-slate-800">Edit Member</h2>

              {editError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{editError}</div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input type="text" value={editForm.full_name} onChange={(e) => setEditForm(f => ({ ...f, full_name: e.target.value }))} required className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select value={editForm.status} onChange={(e) => setEditForm(f => ({ ...f, status: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setEditingMember(null)} className="flex-1 py-3 rounded-xl text-sm font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 min-h-[44px] transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={editSaving} className="flex-1 py-3 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white min-h-[44px] disabled:opacity-50 transition-colors">
                  {editSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
