import type { DashboardStats } from '@/lib/types';

export default function DashboardStats({ stats }: { stats: DashboardStats }) {
  return (
    <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-gray-100">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
        Recruitment Status
      </h2>
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-blue-50 rounded-xl p-3 md:p-4 text-center">
          <p className="text-2xl md:text-3xl font-bold text-blue-700">{stats?.Tong_Lao_Dong || 0}</p>
          <p className="text-xs text-gray-500 mt-1">Required</p>
        </div>
        <div className="bg-green-50 rounded-xl p-3 md:p-4 text-center">
          <p className="text-2xl md:text-3xl font-bold text-green-700">{stats?.Trung_Tuyen || 0}</p>
          <p className="text-xs text-gray-500 mt-1">Selected</p>
        </div>
        <div className="bg-red-50 rounded-xl p-3 md:p-4 text-center">
          <p className="text-2xl md:text-3xl font-bold text-red-600">{stats?.Con_Thieu || 0}</p>
          <p className="text-xs text-gray-500 mt-1">Missing</p>
        </div>
      </div>
    </div>
  );
}
