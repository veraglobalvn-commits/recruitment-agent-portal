interface LoadingSkeletonProps {
  type: 'dashboard' | 'order';
}

export default function LoadingSkeleton({ type }: LoadingSkeletonProps) {
  if (type === 'dashboard') {
    return (
      <div className="min-h-screen bg-gray-100 p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <div className="space-y-2">
              <div className="h-7 w-64 bg-gray-200 rounded animate-pulse" />
              <div className="h-4 w-36 bg-gray-200 rounded animate-pulse" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-lg shadow">
                <div className="h-5 w-48 bg-gray-200 rounded animate-pulse mb-4" />
                <div className="grid grid-cols-3 gap-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="bg-gray-50 p-4 rounded-lg">
                      <div className="h-8 w-16 bg-gray-200 rounded animate-pulse mx-auto" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-white p-6 rounded-lg shadow">
                <div className="h-5 w-40 bg-gray-200 rounded animate-pulse mb-4" />
                <div className="flex items-center gap-4">
                  <div className="h-[200px] w-[200px] bg-gray-200 rounded-full animate-pulse" />
                  <div className="space-y-2 flex-1">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-4 w-full bg-gray-200 rounded animate-pulse" />
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <div className="h-5 w-36 bg-gray-200 rounded animate-pulse mb-4" />
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="border p-4 rounded-lg">
                    <div className="h-5 w-40 bg-gray-200 rounded animate-pulse mb-2" />
                    <div className="grid grid-cols-2 gap-2">
                      {[1, 2].map((j) => (
                        <div key={j} className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="h-5 w-48 bg-gray-200 rounded animate-pulse mb-6" />
        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <div className="h-7 w-64 bg-gray-200 rounded animate-pulse" />
        </div>
        <div className="bg-white p-6 rounded-lg shadow space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="border p-4 rounded-lg">
              <div className="flex justify-between mb-2">
                <div className="h-5 w-32 bg-gray-200 rounded animate-pulse" />
                <div className="h-5 w-20 bg-gray-200 rounded animate-pulse" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3, 4, 5, 6].map((j) => (
                  <div key={j} className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
