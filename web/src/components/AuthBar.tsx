import { useEffect, useRef, useState } from 'react';

import { ChevronDown, History, LogOut, Trash2 } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import { errMessage } from '../lib/format';
import { ConfirmDialog } from './ConfirmDialog';

const menuItem =
  'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition';

// top-right widget: log in button when anonymous, account menu when logged in
export function AuthBar() {
  const { user, loading, logout, deleteAccount } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const historyOpen = location.pathname === '/history';

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // dismiss the dropdown on outside click or Esc
  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  if (loading) {
    // reserve the button's footprint so the nav doesn't jump when auth resolves
    return <span className="inline-block h-9 w-[68px]" aria-hidden="true" />;
  }

  if (!user) {
    return (
      <button onClick={() => navigate('/auth')} className="btn-secondary h-9 px-3.5 text-sm">
        Log in
      </button>
    );
  }

  const close = () => setMenuOpen(false);

  // on success user becomes null, re-rendering logged-out and unmounting the dialog
  async function onConfirmDeleteAccount() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAccount();
      setConfirmDelete(false);
      navigate('/');
    } catch (e) {
      setDeleteError(errMessage(e));
      setDeleting(false);
    }
  }

  return (
    <>
      <div ref={containerRef} className="relative">
        <button
          onClick={() => setMenuOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="btn-secondary h-9 gap-2 pl-1.5 pr-2.5 text-sm"
        >
          <span className="flex size-6 items-center justify-center rounded-full bg-ink text-[11px] font-semibold uppercase text-white">
            {user.username.slice(0, 1)}
          </span>
          <span className="max-w-[9rem] truncate">{user.username}</span>
          <ChevronDown
            className={`size-3.5 text-ink-3 transition-transform ${menuOpen ? 'rotate-180' : ''}`}
            strokeWidth={2.5}
          />
        </button>

        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-full z-40 mt-2 min-w-[200px] rounded-xl bg-panel p-1.5 shadow-lift"
          >
            <button
              role="menuitem"
              onClick={() => {
                navigate(historyOpen ? '/' : '/history');
                close();
              }}
              className={`${menuItem} text-ink hover:bg-sunken`}
            >
              <History className="size-4 text-ink-3" strokeWidth={2} />
              {historyOpen ? 'New crawl' : 'History'}
            </button>
            <button
              role="menuitem"
              onClick={async () => {
                await logout();
                close();
                navigate('/');
              }}
              className={`${menuItem} text-ink hover:bg-sunken`}
            >
              <LogOut className="size-4 text-ink-3" strokeWidth={2} />
              Log out
            </button>
            <div className="my-1 border-t border-line" />
            <button
              role="menuitem"
              onClick={() => {
                setConfirmDelete(true);
                close();
              }}
              className={`${menuItem} text-bad-fg hover:bg-bad-bg`}
            >
              <Trash2 className="size-4" strokeWidth={2} />
              Delete account
            </button>
          </div>
        )}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete your account?"
          message={
            <>
              This permanently deletes the account{' '}
              <span className="font-semibold text-ink">{user.username}</span>, along with every
              crawl you&rsquo;ve run and its results. Any crawls still running are stopped. This
              can&rsquo;t be undone.
            </>
          }
          confirmLabel="Delete account"
          busyLabel="Deleting…"
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
