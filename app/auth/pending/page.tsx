'use client';

export default function PendingPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white p-8 rounded-2xl shadow-md w-full max-w-sm text-center">
        <div className="text-4xl mb-4">⏳</div>
        <h1 className="text-xl font-bold text-gray-800 mb-2">Account Pending Activation</h1>
        <p className="text-sm text-gray-500 mb-6">
          Your account has been created and is awaiting admin review. You will be able to sign in once it is activated.
        </p>
        <p className="text-xs text-gray-400 mb-6">
          Please contact an administrator if you need urgent assistance.
        </p>
        <a
          href="/"
          className="inline-flex w-full items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg text-sm transition-colors min-h-[44px]"
        >
          Back to Login
        </a>
      </div>
    </div>
  );
}
