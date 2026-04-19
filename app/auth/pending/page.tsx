'use client';

export default function PendingPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white p-8 rounded-2xl shadow-md w-full max-w-sm text-center">
        <div className="text-4xl mb-4">⏳</div>
        <h1 className="text-xl font-bold text-gray-800 mb-2">Chờ kích hoạt tài khoản</h1>
        <p className="text-sm text-gray-500 mb-6">
          Tài khoản của bạn đã được tạo thành công và đang chờ admin xem xét. Bạn sẽ có thể đăng nhập sau khi được kích hoạt.
        </p>
        <p className="text-xs text-gray-400 mb-6">
          Vui lòng liên hệ quản trị viên nếu cần hỗ trợ khẩn cấp.
        </p>
        <a
          href="/"
          className="inline-block w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg text-sm transition-colors min-h-[44px] flex items-center justify-center"
        >
          Quay lại trang đăng nhập
        </a>
      </div>
    </div>
  );
}
