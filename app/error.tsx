'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-sm text-center">
        <h2 className="text-xl font-bold text-red-600 mb-4">
          Something went wrong
        </h2>
        <p className="text-gray-600 text-sm mb-6">{error.message}</p>
        <button
          onClick={reset}
          className="bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
