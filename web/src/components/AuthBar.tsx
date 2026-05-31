import { useEffect, useRef, useState } from 'react';

import { User } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import { ConfirmDialog } from './ConfirmDialog';

// top-right widget. anonymous: a log in/register link. logged in: username is the menu
// button (history + logout).
export function AuthBar() {
  const { user, loading, logout, deleteAccount } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const historyOpen = location.pathname === '/history';

  // delete-account confirmation state
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  // delete the account, then go to the hero. on success user becomes null and this re-renders
  // logged-out, unmounting the dialog.
  async function onConfirmDeleteAccount() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAccount();
      setConfirmDelete(false);
      navigate('/');
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : String(e));
      setDeleting(false);
    }
  }

  return (
    <>
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
            <div className="border-t border-ink-500/70" />
            <button
              onClick={() => {
                setConfirmDelete(true);
                close();
              }}
              className="block w-full px-4 py-2.5 text-left font-mono text-[11px] uppercase tracking-widest text-rose-400 transition hover:bg-rose-500/10 hover:text-rose-300"
            >
              delete account
            </button>
          </div>
        )}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          eyebrow="delete account"
          title="Delete your account?"
          message={
            <>
              This permanently deletes your account{' '}
              <span className="font-mono text-paper">{user.username}</span>, every crawl
              you&rsquo;ve run and all of their results, and stops any crawls still in progress.
              This can&rsquo;t be undone.
            </>
          }
          confirmLabel="delete account"
          busyLabel="deleting…"
          busy={deleting}
          error={deleteError}
          onConfirm={onConfirmDeleteAccount}
          onCancel={() => {
            setConfirmDelete(false);
            setDeleteError(null);
          }}
        />
      )}
    </>
  );
}
