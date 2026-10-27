import { useState } from 'react';

import { ChevronDown, History, LogOut, Trash2 } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import type { Me } from '../api';
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

// the logged-in account menu; loaded on demand so anonymous visitors don't download it
export default function AccountMenu({ user }: { user: Me }) {
  const { logout, deleteAccount } = useAuth();
  const navigate = useNavigate();
  const historyOpen = useLocation().pathname === '/history';

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
          <Button
            variant="secondary"
            aria-label={user.username}
            className="group gap-2 pr-2.5 pl-1.5"
          >
            <span className="bg-ink text-code flex size-6 items-center justify-center rounded-full font-semibold text-white uppercase">
              {user.username.slice(0, 1)}
            </span>
            {/* phones show just the avatar so the header fits; the label still names the account */}
            <span className="hidden max-w-36 truncate sm:block">{user.username}</span>
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
              This deletes the account{' '}
              <span className="text-ink font-semibold">{user.username}</span> and every crawl
              you&rsquo;ve run (any still running are stopped). It can&rsquo;t be undone.
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
