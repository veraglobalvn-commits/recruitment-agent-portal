export default function OrdersLoading() {
  return (
    <div className="p-4 space-y-3 animate-pulse">
      <div className="h-10 w-32 bg-gray-200 rounded-xl" />
      <div className="flex gap-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-8 w-20 bg-gray-200 rounded-full" />
        ))}
      </div>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
          <div className="flex justify-between">
            <div className="h-4 w-40 bg-gray-200 rounded" />
            <div className="h-5 w-20 bg-gray-200 rounded-full" />
          </div>
          <div className="h-3 w-24 bg-gray-200 rounded" />
          <div className="h-1.5 w-full bg-gray-100 rounded-full" />
        </div>
      ))}
    </div>
  );
}
