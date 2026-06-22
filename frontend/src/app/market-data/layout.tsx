'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TrendingUp, LogOut } from 'lucide-react';
import { fetchWithAuth } from '@/lib/apiClient';

export default function MarketDataLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState('');
  const [userRole, setUserRole] = useState('');

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (!user?.role) {
      router.push('/login');
    } else {
      setUserEmail(user.email);
      setUserRole(user.role);
    }
  }, [router]);

  const handleBack = () => {
    if (userRole === 'ADMIN') router.push('/admin/users');
    else if (userRole === 'EXPERT') router.push('/expert');
    else router.push('/decision-maker');
  };

  const handleLogout = async () => {
    try { await fetchWithAuth('/auth/logout', { method: 'POST' }); } catch {}
    localStorage.clear();
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
      {/* Top bar */}
      <header className="bg-neutral-900 border-b border-neutral-800 flex items-center justify-between px-8 py-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-teal-500 to-emerald-400 flex items-center justify-center">
            <TrendingUp size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Market Data</h1>
            <p className="text-xs text-neutral-500">CoinMarketCap — Live Scraping</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={handleBack} className="text-sm text-neutral-400 hover:text-white transition-colors">
            ← Back to Dashboard
          </button>
          <span className="text-xs bg-neutral-800 text-neutral-400 px-3 py-1 rounded-full border border-neutral-700">{userEmail}</span>
          <button onClick={handleLogout} className="flex items-center gap-1.5 text-sm text-neutral-400 hover:text-red-400 transition-colors">
            <LogOut size={15} /> Logout
          </button>
        </div>
      </header>
      <main className="flex-1 p-8 max-w-7xl mx-auto w-full">{children}</main>
    </div>
  );
}
