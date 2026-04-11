'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

interface AdminUser {
  uid: string;
  email: string;
}

const NAV = [
  { href: '/admin', label: 'Tổng quan', icon: '📊' },
  { href: '/admin/companies', label: 'Công ty VN', icon: '🏭' },
  { href: '/admin/orders', label: 'Đơn hàng', icon: '📋' },
  { href: '/admin/agents', label: 'Agent BD', icon: '👥' },
  { href: '/admin/candidates', label: 'Ứng viên', icon: '🧑‍💼' },
  { href: '/admin/reports', label: 'Báo cáo', icon: '📈' },
];

function SidebarContent({
  admin,
  pathname,
  onSignOut,
  onNavClick,
}: {
  admin: AdminUser | null;
  pathname: string;
  onSignOut: () => void;
  onNavClick?: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-5 border-b border-slate-700">
        <div className="text-xs text-slate-400 uppercase tracking-widest">Vera Global</div>
        <div className="text-base font-bold text-white mt-0.5">Quản trị</div>
      </div>
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, label, icon }) => {
          const active = href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavClick}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm transition-colors min-h-[44px] ${
                active
                  ? 'bg-blue-600 text-white font-semibold'
                  : 'text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              <span className="text-base">{icon}</span>
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="px-4 py-3 border-t border-slate-700">
        <div className="text-xs text-slate-400 truncate">{admin?.email}</div>
        <button
          onClick={onSignOut}
          className="mt-2 text-xs text-slate-400 hover:text-red-400 transition-colors min-h-[36px] flex items-center"
        >
          Đăng xuất
        </button>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace('/');
  };

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/'); return; }

      const { data: agentData } = await supabase
        .from('agents')
        .select('role, full_name')
        .eq('supabase_uid', user.id)
        .maybeSingle();

      if (!agentData || agentData.role !== 'admin') {
        router.replace('/');
        return;
      }

      setAdmin({ uid: user.id, email: user.email ?? '' });
      setChecking(false);
    };
    checkAdmin();
  }, [router]);

  // Close mobile nav on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  if (checking) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-sm animate-pulse">Đang kiểm tra quyền truy cập...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">

      {/* ── Desktop Sidebar (hidden on mobile) ── */}
      <aside className="hidden md:flex w-56 bg-slate-900 text-white flex-col min-h-screen fixed left-0 top-0 z-30">
        <SidebarContent admin={admin} pathname={pathname} onSignOut={signOut} />
      </aside>

      {/* ── Mobile: Overlay + Drawer ── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-slate-900 text-white z-50 transform transition-transform duration-300 md:hidden ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-4 right-4 text-slate-400 hover:text-white text-xl min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          ✕
        </button>
        <SidebarContent
          admin={admin}
          pathname={pathname}
          onSignOut={signOut}
          onNavClick={() => setMobileOpen(false)}
        />
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 md:ml-56 flex flex-col min-h-screen">
        {/* Mobile top bar */}
        <header className="md:hidden bg-slate-900 text-white px-4 py-3 flex items-center gap-3 sticky top-0 z-30">
          <button
            onClick={() => setMobileOpen(true)}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-xl"
          >
            ☰
          </button>
          <div>
            <div className="text-xs text-slate-400">Vera Global</div>
            <div className="text-sm font-bold">Quản trị</div>
          </div>
        </header>

        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
