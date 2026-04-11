'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { DashboardStats, Order } from '@/lib/types';
import LoginForm from '@/components/LoginForm';
import DashboardStatsComponent from '@/components/DashboardStats';
import PaymentChart from '@/components/PaymentChart';
import OrdersList from '@/components/OrdersList';
import LoadingSkeleton from '@/components/LoadingSkeleton';

export default function Home() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [agentName, setAgentName] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [checkingSession, setCheckingSession] = useState(true);

  const handleLogout = useCallback(async () => {
    await supabase?.auth.signOut();
    setIsLoggedIn(false);
    setUserId(null);
    setAgentName(null);
    setStats(null);
    setOrders([]);
    localStorage.removeItem('agent_id');
  }, []);

  useEffect(() => {
    if (!supabase) {
      setCheckingSession(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUserId(session.user.id);
        setIsLoggedIn(true);
      }
      setCheckingSession(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setUserId(session.user.id);
        setIsLoggedIn(true);
      } else {
        setIsLoggedIn(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchDashboardData = useCallback(
    async (uid: string) => {
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
        const { data: agentData, error: agentErr } = await supabase
          .from('agents')
          .select('id, full_name, short_name, recruitment_stats(*), orders(*)')
          .eq('supabase_uid', uid)
          .single();

        if (agentErr || !agentData) {
          setError('Agent not found. Please contact admin.');
          setIsLoggedIn(false);
          return;
        }

        const statsRaw = (agentData as any).recruitment_stats;
        const stats: DashboardStats | null = statsRaw ? {
          Tong_Lao_Dong: statsRaw.tong_lao_dong,
          Trung_Tuyen: statsRaw.trung_tuyen,
          Con_Thieu: statsRaw.con_thieu,
          Tong_Tien_Can_TT: statsRaw.tong_tien_can_tt,
          Tong_Tien_Da_TT: statsRaw.tong_tien_da_tt,
          Tong_Tien_Chua_TT: statsRaw.tong_tien_chua_tt,
        } : null;

        const ordersRaw: any[] = (agentData as any).orders || [];
        const orders: Order[] = ordersRaw.map((o: any) => ({
          order_id: o.id,
          company: o.company_name,
          total_labor: o.total_labor,
          missing: o.labor_missing,
          status: o.status || 'N/A',
          url_demand_letter: o.url_demand_letter,
          job_type: o.job_type,
          salary_usd: o.salary_usd,
          url_order: o.url_order,
        }));

        const result = {
          agent_name: agentData.short_name || agentData.full_name,
          agent_id: agentData.id,
          stats,
          orders,
        };

        setAgentName(result.agent_name);
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
    if (!supabase) {
      setError('System loading...');
      setLoading(false);
      return;
    }
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (authError) {
        setError(`Login failed: ${authError.message}`);
        setLoading(false);
      }
      if (data?.user) {
        setUserId(data.user.id);
        setIsLoggedIn(true);
      }
    } catch (err) {
      setError(`Error: ${err instanceof Error ? err.message : String(err)}`);
      setLoading(false);
    }
  };

  if (checkingSession) {
    return <LoadingSkeleton type="dashboard" />;
  }

  if (!isLoggedIn) {
    return (
      <LoginForm
        onSubmit={handleLogin}
        email={email}
        password={password}
        error={error}
        loading={loading}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-20">
        <div className="max-w-3xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-base md:text-lg font-bold text-gray-800">Agent Portal</h1>
            <p className="text-xs text-blue-600 font-medium">Hi, {agentName}</p>
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
            {stats && <PaymentChart stats={stats} />}
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
