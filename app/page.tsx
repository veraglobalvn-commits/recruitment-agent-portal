'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { PieChart, Pie, Cell, Tooltip } from 'recharts';

const COLORS = ['#00C49F', '#FF8042'];

export default function Home() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [agentName, setAgentName] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    if (!supabase) { setError('System loading...'); setLoading(false); return; }
    
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError('Invalid email or password.'); setLoading(false); } 
    else { setUserId(data.user.id); setIsLoggedIn(true); }
  };

  useEffect(() => {
    if (!isLoggedIn || !userId) return;
    const fetchData = async () => {
      try {
        const res = await fetch(process.env.NEXT_PUBLIC_N8N_API_URL || '', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ supabase_user_id: userId })
        });
        const result = await res.json();
        if (result.error) { setError(result.error); setIsLoggedIn(false); } 
        else { setAgentName(result.agent_name); setStats(result.stats); setOrders(result.orders); }
      } catch (err) { setError('Failed to load data'); } 
      finally { setLoadingData(false); }
    };
    fetchData();
  }, [isLoggedIn, userId]);

  const formatVND = (val: string | number) => {
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return '0 VND';
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num);
  };

  const pieData = stats ? [
    { name: 'Paid', value: parseFloat(stats.Tong_Tien_Da_TT) || 0 },
    { name: 'Unpaid', value: parseFloat(stats.Tong_Tien_Chua_TT) || 0 },
  ] : [];

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-sm">
          <h1 className="text-xl font-bold text-center mb-2 text-blue-900">Bangladesh Agent Portal</h1>
          <p className="text-sm text-center text-gray-500 mb-6">Vietnam Recruitment</p>
          {error && (<div className="mb-4 p-3 bg-red-100 text-red-700 text-sm rounded-md">{error}</div>)}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" placeholder="agent@email.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" placeholder="••••••••" />
            </div>
            <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50">{loading ? 'LOGGING IN...' : 'LOGIN NOW'}</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-8">
      <div className="flex justify-between items-center mb-6 max-w-7xl mx-auto">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-800">Bangladesh Agent Portal</h1>
          <p className="text-sm text-gray-500">Vietnam Recruitment</p>
          <p className="text-blue-600 font-semibold mt-1">Hi, {agentName}</p>
        </div>
        <button onClick={() => { supabase?.auth.signOut(); setIsLoggedIn(false); }} className="text-sm text-red-600 hover:underline">Log out</button>
      </div>

      {loadingData ? ( <div className="text-center py-10">Loading data...</div> ) : (
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-lg font-semibold text-gray-700 mb-4">📊 RECRUITMENT STATUS</h2>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="bg-blue-50 p-4 rounded-lg"><p className="text-2xl font-bold text-blue-900">{stats?.Tong_Lao_Dong || 0}</p><p className="text-xs text-gray-500 mt-1">Required</p></div>
                <div className="bg-green-50 p-4 rounded-lg"><p className="text-2xl font-bold text-green-900">{stats?.Trung_Tuyen || 0}</p><p className="text-xs text-gray-500 mt-1">Selected</p></div>
                <div className="bg-red-50 p-4 rounded-lg"><p className="text-2xl font-bold text-red-900">{stats?.Con_Thieu || 0}</p><p className="text-xs text-gray-500 mt-1">Missing</p></div>
              </div>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-lg font-semibold text-gray-700 mb-4">💰 PAYMENT STATUS</h2>
              <div className="flex flex-col md:flex-row items-center gap-4">
                <PieChart width={200} height={200}>
                  <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} fill="#8884d8" dataKey="value" label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}>
                    {pieData.map((entry, index) => ( <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} /> ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
                <div className="text-sm space-y-2">
                  <p><span className="font-semibold">Total Due:</span> {formatVND(stats?.Tong_Tien_Can_TT || 0)}</p>
                  <p className="text-green-600"><span className="font-semibold">Paid:</span> {formatVND(stats?.Tong_Tien_Da_TT || 0)}</p>
                  <p className="text-red-600"><span className="font-semibold">Unpaid:</span> {formatVND(stats?.Tong_Tien_Chua_TT || 0)}</p>
                </div>
              </div>
            </div>
            <div className="text-right"><button className="text-blue-600 hover:underline text-sm">View All Candidates {'->'}</button></div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-lg font-semibold text-gray-700 mb-4">📦 YOUR ORDERS</h2>
            <div className="space-y-4">
              {orders.length === 0 ? <p className="text-gray-500 text-sm">No orders found.</p> : 
               orders.map((order: any, idx: number) => (
                <div key={idx} className="border p-4 rounded-lg hover:bg-gray-50">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-gray-800">{order.order_id}</h3>
                    <span className={`px-2 py-1 text-xs rounded ${order.status === 'N/A' ? 'bg-gray-200 text-gray-600' : 'bg-yellow-100 text-yellow-700'}`}>{order.status}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                    <p>Need: <span className="font-semibold text-gray-800">{order.total_labor}</span></p>
                    <p>Missing: <span className="font-semibold text-red-600">{order.missing}</span></p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {order.url_demand_letter && <a href={order.url_demand_letter} target="_blank" className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200">📄 View DL</a>}
                    <button className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded hover:bg-gray-200">📋 View List</button>
                    <button className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200">📤 Submit Passport</button>
                  </div>
                </div>
               ))
              }
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
