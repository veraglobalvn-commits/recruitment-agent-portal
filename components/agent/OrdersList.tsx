import Link from 'next/link';
import type { Order } from '@/lib/types';

export default function OrdersList({ orders }: { orders: Order[] }) {
  if (orders.length === 0) {
    return <p className="text-gray-500 text-sm py-4 text-center">No orders found.</p>;
  }

  return (
    <div className="space-y-3">
      {orders.map((order, idx) => {
        const missing = typeof order.missing === 'number' ? order.missing : parseInt(String(order.missing)) || 0;
        const allocated = typeof order.allocated_labor === 'number' ? order.allocated_labor : (typeof order.total_labor === 'number' ? order.total_labor : parseInt(String(order.total_labor)) || 0);
        const passed = allocated - missing;
        return (
        <Link
          href={`/order/${encodeURIComponent(order.order_id)}?dl=${encodeURIComponent(order.url_demand_letter || '')}`}
          key={idx}
          className="block border border-gray-200 rounded-xl p-4 hover:bg-gray-50 hover:border-blue-300 transition-all active:scale-[0.99]"
        >
          <div className="flex justify-between items-start gap-2 mb-3">
            <h3 className="font-bold text-gray-800 text-sm leading-tight flex-1">{order.order_id}</h3>
          </div>

          <div className="grid grid-cols-4 gap-2 mb-3">
            <div className="bg-blue-50 rounded-lg px-2 py-2">
              <p className="text-xs text-gray-500">Applied</p>
              <p className="font-bold text-blue-600">{order.candidates_count ?? '—'}</p>
            </div>
            <div className="bg-gray-50 rounded-lg px-2 py-2">
              <p className="text-xs text-gray-500">Target</p>
              <p className="font-bold text-gray-800">{allocated}</p>
            </div>
            <div className="bg-green-50 rounded-lg px-2 py-2">
              <p className="text-xs text-gray-500">Passed</p>
              <p className="font-bold text-green-600">{passed}</p>
            </div>
            <div className="bg-red-50 rounded-lg px-2 py-2">
              <p className="text-xs text-gray-500">Missing</p>
              <p className="font-bold text-red-600">{order.missing ?? '—'}</p>
            </div>
          </div>

          {(order.job_type_en || order.salary_usd) && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 text-xs text-gray-600">
              {order.job_type_en && <span>📌 {order.job_type_en}</span>}
              {order.salary_usd ? <span>💵 ${order.salary_usd}/mo</span> : null}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {order.url_demand_letter && (
              <a
                href={order.url_demand_letter}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-200 min-h-[36px] flex items-center"
              >
                Demand Letter ↗
              </a>
            )}
            <span className="text-xs bg-slate-800 text-white px-3 py-1.5 rounded-lg min-h-[36px] flex items-center">
              View Candidates →
            </span>
          </div>
        </Link>
        );
      })}
    </div>
  );
}
