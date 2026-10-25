import { useState } from 'react';

import { ChevronDown, History, LogOut, Trash2 } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import { errMessage } from '../lib/format';
import { ConfirmDialog } from './ConfirmDialog';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

// top-right widget: log in button when anonymous, account menu when logged in
export function AuthBar() {
  const { user, loading, logout, deleteAccount } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const historyOpen = location.pathname === '/history';

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (loading) {
    // reserve the button's footprint so the nav doesn't jump when auth resolves
    return <span className="inline-block h-9 w-17" aria-hidden="true" />;
  }

  if (!user) {
    return (
      <Button variant="secondary" onClick={() => navigate('/auth')} className="px-3.5">
        Log in
      </Button>
    );
  }

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
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" className="group gap-2 pr-2.5 pl-1.5">
            <span className="bg-ink flex size-6 items-center justify-center rounded-full text-[11px] font-semibold text-white uppercase">
              {user.username.slice(0, 1)}
            </span>
            <span className="max-w-36 truncate">{user.username}</span>
            <ChevronDown
              className="text-ink-3 size-3.5 transition-transform group-data-[state=open]:rotate-180"
              strokeWidth={2.5}
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => navigate(historyOpen ? '/' : '/history')}>
            <History className="text-ink-3" strokeWidth={2} />
            {historyOpen ? 'New crawl' : 'History'}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={async () => {
              await logout();
              navigate('/');
            }}
          >
            <LogOut className="text-ink-3" strokeWidth={2} />
            Log out
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
            <Trash2 strokeWidth={2} />
            Delete account
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete your account?"
          message={
            <>
              This permanently deletes the account{' '}
              <span className="text-ink font-semibold">{user.username}</span>, along with every
              crawl you&rsquo;ve run and its results. Any crawls still running are stopped. This
              can&rsquo;t be undone.
            </>
          }
          confirmLabel="Delete account"
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
