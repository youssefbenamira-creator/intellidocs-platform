'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { fetchWithAuth } from '@/lib/apiClient';
import NotificationBell from '@/components/NotificationBell';

const ACCENT      = '#fc7c78';
const ACCENT_DIM  = 'rgba(252,124,120,0.08)';
const ACCENT_GLOW = 'rgba(252,124,120,0.18)';
const GRADIENT    = 'linear-gradient(135deg, #fc7c78 0%, #f43f5e 100%)';

const NAV_ITEMS = [
  { href: '/decision-maker',           label: 'Executive Dashboard', icon: 'dashboard',     exact: true  },
  { href: '/decision-maker/explorer',  label: 'Explorer',            icon: 'folder_open',   exact: false },
  { href: '/decision-maker/analytics', label: 'Analytics',           icon: 'insights',      exact: false },
  { href: '/decision-maker/documents', label: 'Documents',           icon: 'folder_shared', exact: false },
  { href: '/decision-maker/assistant', label: 'AI Assistant',        icon: 'smart_toy',     exact: false },
];

export default function DecisionMakerLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const [userEmail, setUserEmail] = useState('');
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (!user || user.role !== 'DECISION_MAKER') {
      router.push('/login');
    } else {
      setUserEmail(user.email);
    }
  }, [router]);

  useEffect(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    setCollapsed(saved !== null ? saved === 'true' : window.innerWidth < 1024);
  }, []);
  const toggleSidebar = () =>
    setCollapsed((c) => { localStorage.setItem('sidebarCollapsed', String(!c)); return !c; });

  const handleLogout = async () => {
    try { await fetchWithAuth('/auth/logout', { method: 'POST' }); } catch {}
    localStorage.clear();
    router.push('/login');
  };

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  const currentPage = NAV_ITEMS.find(n => isActive(n.href, n.exact))?.label ?? 'Dashboard';

  return (
    <div
      className="min-h-screen flex overflow-hidden"
      style={{ background: '#0e1511', color: '#dde4dd', fontFamily: "var(--font-inter), Inter, sans-serif" }}
    >
      {/* ── Sidebar ── */}
      <aside
        className={`${collapsed ? 'w-[76px]' : 'w-[260px]'} h-screen sticky left-0 top-0 flex flex-col py-4 px-3 shrink-0 transition-[width] duration-200`}
        style={{ background: '#1a211d', borderRight: '1px solid #3c4a42' }}
      >
        {/* Brand + collapse toggle */}
        <div className={`flex items-center mb-8 mt-2 ${collapsed ? 'flex-col gap-2' : 'gap-3 px-2'}`}>
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center shadow-lg shrink-0"
            style={{ background: ACCENT }}
          >
            <span className="material-symbols-outlined text-[20px]" style={{ color: '#410005' }}>trending_up</span>
          </div>
          {!collapsed && (
            <div className="overflow-hidden flex-1">
              <h1
                className="text-[18px] font-bold leading-none truncate"
                style={{ color: ACCENT, fontFamily: "var(--font-geist-sans), Geist, sans-serif" }}
              >
                Decision Hub
              </h1>
              <p className="text-[10px] tracking-widest mt-0.5 uppercase" style={{ color: 'rgba(187,202,191,0.6)' }}>
                Analytics Suite
              </p>
            </div>
          )}
          <button
            onClick={toggleSidebar}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors"
            style={{ color: '#bbcabf' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; }}
          >
            <span className="material-symbols-outlined text-[20px]">{collapsed ? 'chevron_right' : 'chevron_left'}</span>
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-0.5">
          {NAV_ITEMS.map(({ href, label, icon, exact }) => {
            const active = isActive(href, exact);
            return (
              <Link
                key={href}
                href={href}
                title={collapsed ? label : undefined}
                className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'} py-3 rounded-lg transition-colors`}
                style={active
                  ? { color: ACCENT, fontWeight: 600, background: ACCENT_DIM, borderLeft: collapsed ? 'none' : `2px solid ${ACCENT}`, paddingLeft: collapsed ? 0 : '10px', paddingRight: collapsed ? 0 : '12px' }
                  : { color: '#bbcabf', paddingLeft: collapsed ? 0 : '12px', paddingRight: collapsed ? 0 : '12px' }
                }
                onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; (e.currentTarget as HTMLElement).style.color = '#dde4dd'; } }}
                onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = ''; (e.currentTarget as HTMLElement).style.color = '#bbcabf'; } }}
              >
                <span className="material-symbols-outlined text-[20px]">{icon}</span>
                {!collapsed && <span className="text-[14px]">{label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User card + logout */}
        <div className="mt-auto space-y-1">
          {!collapsed ? (
            <div className="p-3 mb-2 rounded-xl glass-card">
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold shrink-0"
                  style={{ background: 'rgba(252,124,120,0.15)', border: '1px solid rgba(252,124,120,0.3)', color: ACCENT }}
                >
                  {userEmail.charAt(0).toUpperCase() || 'D'}
                </div>
                <div className="overflow-hidden">
                  <p className="text-[14px] font-semibold truncate" style={{ color: '#dde4dd' }}>Decision Hub</p>
                  <p className="text-[11px] truncate" style={{ color: '#bbcabf' }}>{userEmail}</p>
                </div>
              </div>
              <Link
                href="/decision-maker/analytics"
                className="w-full py-2 rounded-lg text-[14px] font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-all"
                style={{ background: GRADIENT, color: '#410005' }}
              >
                <span className="material-symbols-outlined text-[18px]">insights</span>
                View Analytics
              </Link>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 mb-2">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold"
                title={userEmail}
                style={{ background: 'rgba(252,124,120,0.15)', border: '1px solid rgba(252,124,120,0.3)', color: ACCENT }}
              >
                {userEmail.charAt(0).toUpperCase() || 'D'}
              </div>
              <Link
                href="/decision-maker/analytics"
                title="View Analytics"
                className="w-10 h-10 rounded-lg flex items-center justify-center hover:opacity-90 transition-all"
                style={{ background: GRADIENT, color: '#410005' }}
              >
                <span className="material-symbols-outlined text-[20px]">insights</span>
              </Link>
            </div>
          )}

          <button
            onClick={handleLogout}
            title={collapsed ? 'Logout' : undefined}
            className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'} px-3 py-3 rounded-lg transition-colors w-full`}
            style={{ color: '#bbcabf' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.08)'; (e.currentTarget as HTMLElement).style.color = '#f87171'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; (e.currentTarget as HTMLElement).style.color = '#bbcabf'; }}
          >
            <span className="material-symbols-outlined text-[20px]">logout</span>
            {!collapsed && <span className="text-[14px]">Logout</span>}
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 h-screen overflow-y-auto flex flex-col">
        {/* Header */}
        <header
          className="h-16 sticky top-0 z-40 flex items-center justify-between px-8 shrink-0"
          style={{ background: '#0e1511', borderBottom: '1px solid #3c4a42' }}
        >
          <div className="flex items-center gap-4">
            <div className="relative">
              <span
                className="absolute inset-y-0 left-3 flex items-center pointer-events-none"
                style={{ color: '#bbcabf' }}
              >
                <span className="material-symbols-outlined text-[18px]">search</span>
              </span>
              <input
                className="rounded-lg pl-10 pr-4 py-1.5 text-[14px] w-64 focus:outline-none transition-all"
                style={{ background: '#09100c', border: '1px solid #3c4a42', color: '#dde4dd' }}
                placeholder="Search analytics…"
                type="text"
                onFocus={e => (e.currentTarget.style.boxShadow = `0 0 0 1px ${ACCENT}`)}
                onBlur={e => (e.currentTarget.style.boxShadow = '')}
              />
            </div>
            <span className="text-[14px] font-medium hidden md:block" style={{ color: '#bbcabf' }}>
              {currentPage}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              className="material-symbols-outlined text-[22px] transition-colors"
              style={{ color: '#bbcabf' }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = ACCENT)}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#bbcabf')}
            >help_outline</button>
            <NotificationBell accent={ACCENT} />
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
