import { useEffect, useRef, useState } from 'react';

import { User } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';

// Top-right corner widget. Anonymous: a "log in / register" link to /auth. Logged in: the
// username is the menu button, revealing history + logout.
export function AuthBar() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const historyOpen = location.pathname === '/history';

  // dismiss the dropdown on any click outside its container
  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [menuOpen]);

  if (loading) return null;

  if (!user) {
    return (
      <button onClick={() => navigate('/auth')} className="btn-ghost">
        log in / register
      </button>
    );
  }

  const close = () => setMenuOpen(false);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setMenuOpen((o) => !o)}
        className={`flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.22em] transition ${
          menuOpen ? 'text-accent' : 'text-ink-300 hover:text-accent'
        }`}
      >
        <User className="h-3 w-3" strokeWidth={2} />
        <span>{user.username}</span>
      </button>

      {menuOpen && (
        <div className="absolute right-0 top-full z-40 mt-3 min-w-[180px] border border-ink-500/70 bg-ink-800 shadow-card">
          <button
            onClick={() => {
              navigate(historyOpen ? '/' : '/history');
              close();
            }}
            className="block w-full px-4 py-2.5 text-left font-mono text-[11px] uppercase tracking-widest text-ink-300 transition hover:bg-ink-700 hover:text-accent"
          >
            {historyOpen ? 'back to crawl' : 'history'}
          </button>
          <div className="border-t border-ink-500/70" />
          <button
            onClick={async () => {
              await logout();
              close();
              navigate('/');
            }}
            className="block w-full px-4 py-2.5 text-left font-mono text-[11px] uppercase tracking-widest text-ink-300 transition hover:bg-ink-700 hover:text-rose-300"
          >
            log out
          </button>
        </div>
      )}
    </div>
  );
}
