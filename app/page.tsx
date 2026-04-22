'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseClient } from '@/lib/supabase';
import type { DashboardStats, Order } from '@/lib/types';
import LoginForm from '@/components/agent/LoginForm';
import DashboardStatsComponent from '@/components/agent/DashboardStats';
import OrdersList from '@/components/agent/OrdersList';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';

export default function Home() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [agentName, setAgentName] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [agencyId, setAgencyId] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [checkingSession, setCheckingSession] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const preloadedAgentRef = useRef<{ id: string; full_name: string; short_name: string | null; role: string | null; agency_id: string | null } | null>(null);

  const isOwner = useMemo(() => userRole === 'agent', [userRole]);

  const handleLogout = useCallback(async () => {
    try {
      const supabase = createSupabaseClient();
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
    setIsLoggedIn(false);
    setUserId(null);
    setAgentName(null);
    setUserRole(null);
    setAgencyId(null);
    setStats(null);
    setOrders([]);
    localStorage.removeItem('agent_id');
    localStorage.removeItem('user_role');
    localStorage.removeItem('agency_id');
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      let supabase;
      try {
        supabase = createSupabaseClient();
      } catch {
        if (!cancelled) setCheckingSession(false);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        if (!cancelled) setCheckingSession(false);

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
          if (cancelled) return;
          if (newSession) {
            try {
              const { data: agentData } = await supabase
                .from('users')
                .select('id, role, status, full_name, short_name, agency_id, avatar_url')
                .eq('supabase_uid', newSession.user.id)
                .maybeSingle();
              if (agentData?.status === 'pending') {
                router.replace('/auth/pending');
                return;
              }
              const adminRoles = ['admin', 'operator', 'read_only'];
              if (agentData?.role && adminRoles.includes(agentData.role)) {
                router.replace('/admin');
                return;
              }
              if (agentData) {
                preloadedAgentRef.current = { id: agentData.id, full_name: agentData.full_name, short_name: agentData.short_name, role: agentData.role ?? null, agency_id: agentData.agency_id ?? null };
              }
              setUserId(newSession.user.id);
              setIsLoggedIn(true);
            } catch {
              // ignore
            }
          }
          setCheckingSession(false);
        });

        return () => {
          cancelled = true;
          subscription.unsubscribe();
        };
      }

      if (cancelled) return;

      try {
        const { data: agentData } = await supabase
          .from('users')
          .select('id, role, status, full_name, short_name, agency_id, avatar_url')
          .eq('supabase_uid', session.user.id)
          .maybeSingle();
        if (cancelled) return;
        if (agentData?.status === 'pending') {
          router.replace('/auth/pending');
          setCheckingSession(false);
          return;
        }
        const adminRoles = ['admin', 'operator', 'read_only'];
        if (agentData?.role && adminRoles.includes(agentData.role)) {
          router.replace('/admin');
          setCheckingSession(false);
          return;
        }
        if (agentData) {
          preloadedAgentRef.current = { id: agentData.id, full_name: agentData.full_name, short_name: agentData.short_name, role: agentData.role ?? null, agency_id: agentData.agency_id ?? null };
        }
        setUserId(session.user.id);
        setIsLoggedIn(true);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setCheckingSession(false);
      }
    })();

    const timeout = setTimeout(() => {
      setCheckingSession(false);
    }, 2000);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [router]);

  const fetchDashboardData = useCallback(
    async (uid: string) => {
      let supabase;
      try {
        supabase = createSupabaseClient();
      } catch {
        setLoadingData(false);
        return;
      }
      try {
        const cacheKey = `dashboard_cache_${uid}`;
        const cachedData = sessionStorage.getItem(cacheKey);

        if (cachedData) {
          try {
            const result = JSON.parse(cachedData);
            setAgentName(result.agent_name);
            setStats(result.stats);
            setOrders(result.orders || []);
            if (result.role) { setUserRole(result.role); localStorage.setItem('user_role', result.role); }
            if (result.agency_id) { setAgencyId(result.agency_id); localStorage.setItem('agency_id', result.agency_id); }
            if (result.avatar_url) setAvatarUrl(result.avatar_url);
            setLoadingData(false); // instant from cache
          } catch (e) {
            sessionStorage.removeItem(cacheKey);
          }
        }

        // Use preloaded agent data from login to skip a round-trip
        const preloaded = preloadedAgentRef.current;
        preloadedAgentRef.current = null;

        let agentData: { id: string; full_name: string; short_name: string | null; role: string | null; agency_id: string | null; avatar_url?: string | null } | null = preloaded;
        if (!agentData) {
          const agentRes = await supabase
            .from('users')
            .select('id, full_name, short_name, role, agency_id, avatar_url')
            .eq('supabase_uid', uid)
            .maybeSingle();
          if (agentRes.error || !agentRes.data) {
            setError('Agent not found. Please contact admin.');
            setIsLoggedIn(false);
            return;
          }
          agentData = agentRes.data;
        }

        // Fetch stats, orders, order_agents, and candidate counts in parallel
        const agentIdEncoded = agentData.id.replace(/"/g, '\\"');
        const [statsRes, ordersRes, oaRes, candCountRes] = await Promise.all([
          supabase.from('recruitment_stats').select('*').eq('agent_id', agentData.id).maybeSingle(),
          supabase.from('orders').select('*').filter('agent_ids', 'cs', `{"${agentIdEncoded}"}`),
          supabase.from('order_agents').select('order_id, assigned_labor_number, assigned_date').eq('agent_id', agentData.id),
          supabase.from('candidates').select('order_id').eq('agent_id', agentData.id),
        ]);

        const statsData = statsRes.data;
        const ordersData = ordersRes.error ? [] : (ordersRes.data ?? []);
        if (ordersRes.error) console.error('Orders query error:', ordersRes.error.message);

        const stats: DashboardStats | null = statsData ? {
          Tong_Lao_Dong: statsData.tong_lao_dong,
          Trung_Tuyen: statsData.trung_tuyen,
          Con_Thieu: statsData.con_thieu,
          Tong_Tien_Can_TT: statsData.tong_tien_can_tt,
          Tong_Tien_Da_TT: statsData.tong_tien_da_tt,
          Tong_Tien_Chua_TT: statsData.tong_tien_chua_tt,
        } : null;

        const rawOrders: Order[] = (ordersData || []).map((o: any) => ({
          order_id: o.id,
          company: o.company_name,
          company_id: o.company_id,
          en_company_name: o.en_company_name,
          total_labor: o.total_labor,
          missing: o.labor_missing,
          status: o.status || 'N/A',
          url_demand_letter: o.url_demand_letter,
          job_type: o.job_type,
          job_type_en: o.job_type_en,
          salary_usd: o.salary_usd,
          url_order: o.url_order,
          meal: o.meal,
          meal_en: o.meal_en,
          dormitory: o.dormitory,
          dormitory_en: o.dormitory_en,
          recruitment_info: o.recruitment_info,
          recruitment_info_en: o.recruitment_info_en,
          probation: o.probation,
          probation_en: o.probation_en,
          probation_salary_pct: o.probation_salary_pct,
          agent_order_status: o.agent_order_status,
          created_at: o.created_at,
        }));

        const oaMap: Record<string, { labor: number; date: string | null }> = Object.fromEntries(
          (oaRes.data || []).map((oa: any) => [oa.order_id, { labor: oa.assigned_labor_number, date: oa.assigned_date }])
        );

        const candCountMap: Record<string, number> = {};
        for (const c of (candCountRes.data || [])) {
          if (c.order_id) candCountMap[c.order_id] = (candCountMap[c.order_id] || 0) + 1;
        }

        const ordersWithAllocation: Order[] = rawOrders.map((o) => ({
          ...o,
          allocated_labor: oaMap[o.order_id]?.labor ?? o.total_labor,
          candidates_count: candCountMap[o.order_id] ?? 0,
        })).sort((a, b) => {
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          const aValid = !isNaN(dateA) && dateA > 0 ? dateA : 0;
          const bValid = !isNaN(dateB) && dateB > 0 ? dateB : 0;
          return bValid - aValid;
        });

        const result = {
          agent_name: agentData.short_name || agentData.full_name,
          agent_id: agentData.id,
          avatar_url: agentData.avatar_url ?? null,
          role: agentData.role ?? null,
          agency_id: agentData.agency_id ?? null,
          stats,
          orders: ordersWithAllocation,
        };

        setAgentName(result.agent_name);
        setAgentId(result.agent_id);
        setAvatarUrl(result.avatar_url);
        setUserRole(result.role);
        setAgencyId(result.agency_id);
        setStats(result.stats);
        setOrders(result.orders);
        if (result.agent_id) localStorage.setItem('agent_id', result.agent_id);
        if (result.role) localStorage.setItem('user_role', result.role);
        if (result.agency_id) localStorage.setItem('agency_id', result.agency_id);
        sessionStorage.setItem(cacheKey, JSON.stringify(result));

      } catch (err) {
        setError('Failed to load data');
      } finally {
        setLoadingData(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (isLoggedIn && userId) {
      setLoadingData(true);
      fetchDashboardData(userId);
    }
  }, [isLoggedIn, userId, fetchDashboardData]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    let supabase;
    try {
      supabase = createSupabaseClient();
    } catch {
      setError('System loading...');
      setLoading(false);
      return;
    }
    try {
      const email = username.trim().toLowerCase();

      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (authError) {
        setError('Incorrect email or password.');
        setLoading(false);
        return;
      }
      if (data?.user) {
        const { data: agentData } = await supabase
          .from('users')
          .select('id, role, status, full_name, short_name, agency_id, avatar_url')
          .eq('supabase_uid', data.user.id)
          .maybeSingle();

        if (agentData?.status === 'pending') {
          await supabase.auth.signOut();
          setLoading(false);
          router.replace('/auth/pending');
          return;
        }
        if (!agentData) {
          await supabase.auth.signOut();
          setError('Account not set up. Please contact admin.');
          setLoading(false);
          return;
        }
        if (agentData.status === 'inactive') {
          await supabase.auth.signOut();
          setError('Account has been deactivated. Please contact admin.');
          setLoading(false);
          return;
        }
        const adminRoles = ['admin', 'operator', 'read_only'];
        if (adminRoles.includes(agentData.role)) {
          setLoading(false);
          router.replace('/admin');
          return;
        }
        // Preload agent info so fetchDashboardData skips a redundant round-trip
        preloadedAgentRef.current = { id: agentData.id, full_name: agentData.full_name, short_name: agentData.short_name, role: agentData.role ?? null, agency_id: agentData.agency_id ?? null };
        setUserId(data.user.id);
        setIsLoggedIn(true);
        setLoading(false);
      }
    } catch (err) {
      setError(`Lỗi: ${err instanceof Error ? err.message : String(err)}`);
      setLoading(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !agentId) return;

    let supabase;
    try {
      supabase = createSupabaseClient();
    } catch {
      return;
    }
    setAvatarUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const filePath = `agents/${agentId}/avatar_${Date.now()}.${ext}`;
      const { error: storageErr } = await supabase.storage
        .from('agent-media')
        .upload(filePath, file, { cacheControl: '3600', upsert: true });
      if (storageErr) throw new Error(`Storage: ${storageErr.message}`);

      const { data: urlData } = supabase.storage.from('agent-media').getPublicUrl(filePath);
      const publicUrl = urlData.publicUrl;

      const { error: dbErr } = await supabase
        .from('users')
        .update({ avatar_url: publicUrl })
        .eq('id', agentId);
      if (dbErr) throw new Error(`DB: ${dbErr.message}`);

      setAvatarUrl(publicUrl);
    } catch (err) {
      alert(`Avatar upload failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  if (checkingSession) {
    return <LoadingSkeleton type="dashboard" />;
  }

  if (!isLoggedIn) {
    return (
      <LoginForm
        onSubmit={handleLogin}
        username={username}
        password={password}
        error={error}
        loading={loading}
        onUsernameChange={setUsername}
        onPasswordChange={setPassword}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hidden input for avatar upload */}
      <input type="file" accept="image/*" ref={avatarInputRef} onChange={handleAvatarUpload} className="hidden" />

      {/* Top nav */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-20">
        <div className="max-w-3xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="relative flex-shrink-0">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="w-10 h-10 rounded-full object-cover border-2 border-gray-200" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center border-2 border-dashed border-gray-300">
                  <span className="text-gray-400 text-xs">No</span>
                </div>
              )}
              <button onClick={() => avatarInputRef.current?.click()} disabled={avatarUploading}
                title="Upload avatar"
                className="absolute -bottom-1 -right-1 w-5 h-5 bg-blue-600 text-white rounded-full text-xs flex items-center justify-center hover:bg-blue-700 disabled:opacity-50">
                {avatarUploading ? '…' : '📷'}
              </button>
            </div>
            <div>
              <h1 className="text-base md:text-lg font-bold text-gray-800">Agent Portal</h1>
              <p className="text-xs text-blue-600 font-medium">Hi, {agentName}</p>
            </div>
          </div>
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors text-xl"
              aria-label="Menu"
            >
              ☰
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-2xl shadow-lg z-50 min-w-[160px] py-1 overflow-hidden">
                <a href="/profile" onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 min-h-[44px]">
                  👤 Profile
                </a>
                {isOwner && (
                  <>
                    <a href="/agency" onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 min-h-[44px]">
                      🏢 Agency
                    </a>
                    <a href="/team" onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 min-h-[44px]">
                      👥 Team
                    </a>
                  </>
                )}
                <div className="border-t border-gray-100 mt-1" />
                <button onClick={() => { setMenuOpen(false); handleLogout(); }}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-red-600 hover:bg-red-50 min-h-[44px]">
                  🚪 Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {error && (
        <div className="max-w-3xl mx-auto px-4 mt-4">
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>
        </div>
      )}

      <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        {loadingData ? (
          <LoadingSkeleton type="dashboard" />
        ) : (
          <>
            {stats && <DashboardStatsComponent stats={stats} />}
            <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-gray-100">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
                Your Orders
              </h2>
              <OrdersList orders={orders} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
