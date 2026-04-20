'use client';

const DEFAULT_COLOR_MAP: Record<string, string> = {
  'Not Started': 'bg-gray-100 text-gray-600',
  'On-going': 'bg-amber-100 text-amber-700',
  'Finished': 'bg-green-100 text-green-700',
  'Cancelled': 'bg-red-100 text-red-600',
  'Đang tuyển': 'bg-amber-100 text-amber-700',
  'Đã tuyển đủ': 'bg-green-100 text-green-700',
  'Chưa TT': 'bg-red-100 text-red-600',
  'Đã TT': 'bg-green-100 text-green-700',
  'TT lan 1': 'bg-blue-100 text-blue-700',
  'TT lan 2': 'bg-indigo-100 text-indigo-700',
  'TT lan 3': 'bg-purple-100 text-purple-700',
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-red-100 text-red-600',
};

export default function StatusPill({
  label,
  colorMap,
}: {
  label: string | null;
  colorMap?: Record<string, string>;
}) {
  if (!label) return <span className="text-gray-400 text-xs">—</span>;
  const map = colorMap ?? DEFAULT_COLOR_MAP;
  return (
    <span
      className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${map[label] ?? 'bg-gray-100 text-gray-600'}`}
    >
      {label}
    </span>
  );
}
