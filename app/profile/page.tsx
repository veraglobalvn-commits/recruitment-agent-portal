'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import TelegramConnectSection from '@/components/agent/TelegramConnectSection';

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);

  const [telegramLinked, setTelegramLinked] = useState<boolean | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const loadProfile = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/'); return; }

      const { data: userData } = await supabase
        .from('users')
        .select('id, full_name, avatar_url, telegram_user_id')
        .eq('supabase_uid', session.user.id)
        .maybeSingle();

      if (!userData) { router.replace('/'); return; }

      setAgentId(userData.id);
      setFullName(userData.full_name || '');
      setEmail(session.user.email || '');
      setAvatarUrl(userData.avatar_url || null);
      setTelegramLinked(!!userData.telegram_user_id);
    } catch {
      router.replace('/');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agentId) return;
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const { error: dbErr } = await supabase
        .from('users')
        .update({ full_name: fullName.trim() })
        .eq('id', agentId);
      if (dbErr) throw new Error(dbErr.message);

      if (email.trim().toLowerCase() !== session.user.email?.toLowerCase()) {
        const { error: authErr } = await supabase.auth.updateUser({ email: email.trim().toLowerCase() });
        if (authErr) throw new Error(authErr.message);
        setProfileMsg('Profile saved. A confirmation email has been sent to verify the new email address.');
      } else {
        setProfileMsg('Profile saved successfully.');
      }
    } catch (err) {
      setProfileMsg(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);
    if (!newPassword || newPassword.length < 8) {
      setPasswordMsg('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg('Passwords do not match.');
      return;
    }
    setSavingPassword(true);
    try {
      // Verify current password by re-authenticating
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user.email) throw new Error('No session');

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: session.user.email,
        password: currentPassword,
      });
      if (signInErr) throw new Error('Current password is incorrect.');

      const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
      if (updateErr) throw new Error(updateErr.message);

      setPasswordMsg('Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordMsg(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSavingPassword(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !agentId) return;
    setAvatarUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const filePath = `agents/${agentId}/avatar_${Date.now()}.${ext}`;
      const { error: storageErr } = await supabase.storage
        .from('agent-media')
        .upload(filePath, file, { cacheControl: '3600', upsert: true });
      if (storageErr) throw new Error(storageErr.message);

      const { data: urlData } = supabase.storage.from('agent-media').getPublicUrl(filePath);
      const { error: dbErr } = await supabase.from('users').update({ avatar_url: urlData.publicUrl }).eq('id', agentId);
      if (dbErr) throw new Error(dbErr.message);
      setAvatarUrl(urlData.publicUrl);
    } catch (err) {
      alert(`Upload failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <input type="file" accept="image/*" ref={avatarInputRef} onChange={handleAvatarUpload} className="hidden" />

      <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => router.back()} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-500 hover:text-gray-700">
          ←
        </button>
        <h1 className="text-base font-bold text-slate-800 flex-1">Profile</h1>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">

        {/* Avatar */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
          <div className="relative flex-shrink-0">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" className="w-20 h-20 rounded-full object-cover border-2 border-gray-200" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center border-2 border-dashed border-gray-300 text-gray-400 text-2xl font-bold">
                {fullName[0]?.toUpperCase() || '?'}
              </div>
            )}
            <button
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarUploading}
              className="absolute -bottom-1 -right-1 w-7 h-7 bg-blue-600 text-white rounded-full flex items-center justify-center hover:bg-blue-700 disabled:opacity-50 text-xs"
            >
              {avatarUploading ? '…' : '📷'}
            </button>
          </div>
          <div>
            <p className="font-semibold text-slate-800">{fullName || '—'}</p>
            <p className="text-xs text-gray-500 mt-0.5">{email}</p>
            <button
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarUploading}
              className="text-xs text-blue-600 hover:text-blue-800 mt-2 min-h-[32px] flex items-center"
            >
              {avatarUploading ? 'Uploading...' : 'Change photo'}
            </button>
          </div>
        </div>

        {/* Profile Info */}
        <form onSubmit={handleSaveProfile} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Personal Information</h2>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]"
            />
            <p className="text-xs text-gray-400 mt-1">Changing email requires confirmation via the new address.</p>
          </div>

          {profileMsg && (
            <p className={`text-sm p-3 rounded-lg ${profileMsg.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
              {profileMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={savingProfile}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl text-sm min-h-[44px] disabled:opacity-50 transition-colors"
          >
            {savingProfile ? 'Saving...' : 'Save Changes'}
          </button>
        </form>

        {/* Change Password */}
        <form onSubmit={handleChangePassword} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Change Password</h2>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]"
              placeholder="Enter current password"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]"
              placeholder="At least 8 characters"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[44px]"
              placeholder="Re-enter new password"
            />
          </div>

          {passwordMsg && (
            <p className={`text-sm p-3 rounded-lg ${passwordMsg.startsWith('Error') || passwordMsg.includes('incorrect') || passwordMsg.includes('match') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
              {passwordMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={savingPassword}
            className="w-full bg-slate-700 hover:bg-slate-800 text-white font-semibold py-3 rounded-xl text-sm min-h-[44px] disabled:opacity-50 transition-colors"
          >
            {savingPassword ? 'Updating...' : 'Update Password'}
          </button>
        </form>

        {/* Telegram */}
        {telegramLinked !== null && (
          <TelegramConnectSection
            isLinked={telegramLinked}
            variant="card"
            onLinked={() => setTelegramLinked(true)}
          />
        )}

      </div>
    </div>
  );
}
