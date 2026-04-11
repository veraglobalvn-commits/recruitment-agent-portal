'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import type { DashboardStats } from '@/lib/types';

const COLORS = ['#22c55e', '#f97316'];

function formatVND(val: string | number): string {
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num) || num === 0) return '0 ₫';
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B ₫`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(0)}M ₫`;
  return new Intl.NumberFormat('vi-VN').format(num) + ' ₫';
}

export default function PaymentChart({ stats }: { stats: DashboardStats }) {
  const pieData = [
    { name: 'Paid', value: parseFloat(String(stats.Tong_Tien_Da_TT)) || 0 },
    { name: 'Unpaid', value: parseFloat(String(stats.Tong_Tien_Chua_TT)) || 0 },
  ];

  const hasData = pieData.some((d) => d.value > 0);

  return (
    <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-gray-100">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
        Payment Status
      </h2>

      <div className="flex flex-col sm:flex-row items-center gap-4">
        {/* Chart — responsive width */}
        <div className="w-full sm:w-48 flex-shrink-0" style={{ height: 180 }}>
          {hasData ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  outerRadius={70}
                  dataKey="value"
                  label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {pieData.map((_e, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatVND(v)} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-300 text-sm">
              No data
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="flex-1 w-full space-y-3">
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-xs text-gray-500">Total Due</p>
            <p className="text-base font-bold text-gray-800 mt-0.5">
              {formatVND(stats.Tong_Tien_Can_TT || 0)}
            </p>
          </div>
          <div className="flex gap-2">
            <div className="flex-1 bg-green-50 rounded-xl p-3">
              <p className="text-xs text-green-600">Paid</p>
              <p className="text-sm font-bold text-green-700 mt-0.5">
                {formatVND(stats.Tong_Tien_Da_TT || 0)}
              </p>
            </div>
            <div className="flex-1 bg-orange-50 rounded-xl p-3">
              <p className="text-xs text-orange-600">Unpaid</p>
              <p className="text-sm font-bold text-orange-700 mt-0.5">
                {formatVND(stats.Tong_Tien_Chua_TT || 0)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
