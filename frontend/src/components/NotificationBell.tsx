'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { fetchWithAuth } from '@/lib/apiClient';

interface Notification {
  id: number;
  title: string;
  message: string;
  link?: string;
  read: boolean;
  createdAt: string;
}

interface Props {
  accent: string;
}

export default function NotificationBell({ accent }: Props) {
  const router = useRouter();
  const [open, setOpen]   = useState(false);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const loadCount = useCallback(async () => {
    try {
      const res = await fetchWithAuth('/notifications/unread-count');
      if (res.ok) setUnread((await res.json()).count);
    } catch {}
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const res = await fetchWithAuth('/notifications');
      if (res.ok) setNotifs(await res.json());
    } catch {}
  }, []);

  // Poll unread count every 30 s
  useEffect(() => {
    loadCount();
    const id = setInterval(loadCount, 30_000);
    return () => clearInterval(id);
  }, [loadCount]);

  // Load full list when opened
  useEffect(() => {
    if (open) loadAll();
  }, [open, loadAll]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleClick = async (n: Notification) => {
    if (!n.read) {
      await fetchWithAuth(`/notifications/${n.id}/read`, { method: 'PATCH' });
      setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
      setUnread(c => Math.max(0, c - 1));
    }
    setOpen(false);
    if (n.link) router.push(n.link);
  };

  const markAll = async () => {
    await fetchWithAuth('/notifications/mark-all-read', { method: 'POST' });
    setNotifs(prev => prev.map(x => ({ ...x, read: true })));
    setUnread(0);
  };

  const remove = async (e: React.MouseEvent, id: number, wasRead: boolean) => {
    e.stopPropagation();
    await fetchWithAuth(`/notifications/${id}`, { method: 'DELETE' });
    setNotifs(prev => prev.filter(x => x.id !== id));
    if (!wasRead) setUnread(c => Math.max(0, c - 1));
  };

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)  return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="relative material-symbols-outlined text-[22px] transition-colors"
        style={{ color: open ? accent : '#bbcabf' }}
        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = accent)}
        onMouseLeave={e => { if (!open) (e.currentTarget as HTMLElement).style.color = '#bbcabf'; }}
      >
        notifications
        {unread > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full flex items-center justify-center text-[10px] font-bold px-0.5"
            style={{ background: '#fc7c78', color: '#fff' }}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-10 w-[340px] rounded-xl shadow-2xl z-50 overflow-hidden"
          style={{ background: '#1a211d', border: '1px solid #3c4a42' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #3c4a42' }}>
            <span className="text-[14px] font-semibold" style={{ color: '#dde4dd' }}>Notifications</span>
            {unread > 0 && (
              <button
                onClick={markAll}
                className="text-[12px] transition-colors"
                style={{ color: accent }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.opacity = '0.7')}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.opacity = '1')}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="overflow-y-auto" style={{ maxHeight: '360px' }}>
            {notifs.length === 0 ? (
              <div className="py-10 text-center" style={{ color: '#86948a' }}>
                <span className="material-symbols-outlined text-[32px] block mb-2">notifications_none</span>
                <p className="text-[13px]">No notifications</p>
              </div>
            ) : (
              notifs.map(n => (
                <div
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className="flex gap-3 px-4 py-3 cursor-pointer group transition-colors"
                  style={{
                    background: n.read ? 'transparent' : `${accent}0a`,
                    borderBottom: '1px solid #3c4a42',
                  }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)')}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = n.read ? 'transparent' : `${accent}0a`)}
                >
                  <div
                    className="mt-0.5 w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: n.read ? '#242c27' : `${accent}20`, color: n.read ? '#86948a' : accent }}
                  >
                    <span className="material-symbols-outlined text-[15px]">
                      {n.read ? 'notifications' : 'notification_important'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium leading-snug" style={{ color: n.read ? '#bbcabf' : '#dde4dd' }}>
                      {n.title}
                    </p>
                    <p className="text-[12px] mt-0.5 line-clamp-2" style={{ color: '#86948a' }}>{n.message}</p>
                    <p className="text-[11px] mt-1" style={{ color: '#3c4a42' }}>{timeAgo(n.createdAt)}</p>
                  </div>
                  <button
                    onClick={(e) => remove(e, n.id, n.read)}
                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity material-symbols-outlined text-[16px] self-start mt-0.5"
                    style={{ color: '#86948a' }}
                  >close</button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
