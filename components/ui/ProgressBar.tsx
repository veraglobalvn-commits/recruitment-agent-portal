'use client';

export default function ProgressBar({
  value,
  max,
  color = 'bg-blue-500',
  height = 'h-1.5',
}: {
  value: number;
  max: number;
  color?: string;
  height?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={`w-full bg-gray-100 rounded-full ${height} overflow-hidden`}>
      <div
        className={`${color} ${height} rounded-full transition-all duration-500`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
