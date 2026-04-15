'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseClient } from '@/lib/supabase';
import type { DashboardStats, Order } from '@/lib/types';
import LoginForm from '@/components/LoginForm';
import DashboardStatsComponent from '@/components/DashboardStats';
import OrdersList from '@/components/OrdersList';
import LoadingSkeleton from '@/components/LoadingSkeleton';

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
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [checkingSession, setCheckingSession] = useState(true);
  const avatarInputRef = useRef<HTMLInputElement>(null);

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
    setStats(null);
    setOrders([]);
    localStorage.removeItem('agent_id');
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
                .from('agents')
                .select('role')
                .eq('supabase_uid', newSession.user.id)
                .maybeSingle();
              if (agentData?.role === 'admin') {
                router.replace('/admin');
                return;
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
          .from('agents')
          .select('role')
          .eq('supabase_uid', session.user.id)
          .maybeSingle();
        if (cancelled) return;
        if (agentData?.role === 'admin') {
          router.replace('/admin');
          setCheckingSession(false);
          return;
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
            setLoadingData(false); // instant from cache
          } catch (e) {
            sessionStorage.removeItem(cacheKey);
          }
        }

        // Read directly from Supabase (bypasses n8n, ~50ms)
        let agentData, agentErr;
        try {
          const agentRes = await supabase
            .from('agents')
            .select('id, full_name, short_name')
            .eq('supabase_uid', uid)
            .maybeSingle();
          agentData = agentRes.data;
          agentErr = agentRes.error;
        } catch (err) {
          agentErr = err as any;
          agentData = null;
        }

        if (agentErr || !agentData) {
          setError('Agent not found. Please contact admin.');
          setIsLoggedIn(false);
          return;
        }

        // Fetch recruitment stats separately
        let statsData;
        try {
          const statsRes = await supabase
            .from('recruitment_stats')
            .select('*')
            .eq('agent_id', agentData.id)
            .maybeSingle();
          statsData = statsRes.data;
        } catch (statsErr) {
          statsData = null;
        }

        const stats: DashboardStats | null = statsData ? {
          Tong_Lao_Dong: statsData.tong_lao_dong,
          Trung_Tuyen: statsData.trung_tuyen,
          Con_Thieu: statsData.con_thieu,
          Tong_Tien_Can_TT: statsData.tong_tien_can_tt,
          Tong_Tien_Da_TT: statsData.tong_tien_da_tt,
          Tong_Tien_Chua_TT: statsData.tong_tien_chua_tt,
        } : null;

        // Fetch orders separately
        // Use .filter() with quoted array element to handle spaces in agent IDs (e.g. "GTA 2026")
        let ordersData;
        try {
          const ordersRes = await supabase
            .from('orders')
            .select('*')
            .filter('agent_ids', 'cs', `{"${agentData.id.replace(/"/g, '\\"')}"}`);
          if (ordersRes.error) {
            console.error('Orders query error:', ordersRes.error.message);
            ordersData = [];
          } else {
            ordersData = ordersRes.data;
          }
        } catch (ordersErr) {
          ordersData = [];
        }

        const orders: Order[] = (ordersData || []).map((o: any) => ({
          order_id: o.id,
          company: o.company_name,
          company_id: o.company_id,
          total_labor: o.total_labor,
          missing: o.labor_missing,
          status: o.status || 'N/A',
          url_demand_letter: o.url_demand_letter,
          job_type: o.job_type,
          job_type_en: o.job_type_en,
          salary_usd: o.salary_usd,
          url_order: o.url_order,
          meal: o.meal || o.meal_en,
          meal_en: o.meal_en || '',
          dormitory: o.dormitory || o.dormitory_en,
          dormitory_en: o.dormitory_en || '',
          recruitment_info: o.recruitment_info || o.recruitment_info_en,
          recruitment_info_en: o.recruitment_info_en || '',
          probation: o.probation || 'Không',
          probation_en: o.probation_en || o.probation || 'Không',
          probation_salary_pct: o.probation_salary_pct,
          agent_order_status: o.agent_order_status,
          created_at: o.created_at,
        })).sort((a, b) => {
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return dateB - dateA;
        });

        const result = {
          agent_name: agentData.short_name || agentData.full_name,
          agent_id: agentData.id,
          avatar_url: null,
          stats,
          orders,
        };

        setAgentName(result.agent_name);
        setAgentId(result.agent_id);
        setAvatarUrl(result.avatar_url);
        setStats(result.stats);
        setOrders(result.orders);
        if (result.agent_id) localStorage.setItem('agent_id', result.agent_id);
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
      let email = username.trim();

      // Nếu không phải email (không có @), tra cứu email qua username (short_name)
      if (!email.includes('@')) {
        const res = await fetch('/api/auth/lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: email }),
        });
        const data = await res.json() as { email?: string; error?: string };
        if (!res.ok || !data.email) {
          setError(data.error || 'Không tìm thấy tài khoản');
          setLoading(false);
          return;
        }
        email = data.email;
      }

      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (authError) {
        setError(`Đăng nhập thất bại: ${authError.message}`);
        setLoading(false);
        return;
      }
      if (data?.user) {
        const { data: agentData } = await supabase
          .from('agents')
          .select('role')
          .eq('supabase_uid', data.user.id)
          .maybeSingle();
        if (agentData?.role === 'admin') {
          router.replace('/admin');
          return;
        }
        setUserId(data.user.id);
        setIsLoggedIn(true);
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
        .from('agents')
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
          <button
            onClick={handleLogout}
            className="text-xs text-red-500 hover:text-red-700 px-3 py-2 rounded-lg hover:bg-red-50 min-h-[44px] min-w-[44px] flex items-center"
          >
            Sign out
          </button>
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
