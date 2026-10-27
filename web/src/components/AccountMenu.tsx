import { useRef, useState } from 'react';

import { ChevronDown, History, LogOut, Trash2 } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import type { Me } from '../api';
import { useAuth } from '../context/AuthContext';
import { ConfirmDialog } from './ConfirmDialog';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

// lazy-loaded so anonymous visitors don't download it
export default function AccountMenu({ user }: { user: Me }) {
  const { logout, deleteAccount } = useAuth();
  const navigate = useNavigate();
  const historyOpen = useLocation().pathname === '/history';

  const [confirmDelete, setConfirmDelete] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  // flushSync commits the route before the cleared user renders, or Protected would redirect to /auth
  async function onConfirmDeleteAccount() {
    await deleteAccount();
    navigate('/', { flushSync: true });
  }

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            ref={trigger}
            variant="secondary"
            aria-label={user.username}
            className="group pr-2.5 pl-1.5"
          >
            <span className="bg-ink text-code flex size-6 items-center justify-center rounded-full font-semibold text-white uppercase">
              {user.username.slice(0, 1)}
            </span>
            <span className="hidden max-w-36 truncate sm:block">{user.username}</span>
            <ChevronDown
              className="text-ink-3 size-3.5 transition-transform group-data-[state=open]:rotate-180"
              strokeWidth={2.5}
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => navigate(historyOpen ? '/' : '/history')}>
            <History className="text-ink-3" />
            {historyOpen ? 'New crawl' : 'History'}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={async () => {
              await logout();
              navigate('/', { flushSync: true });
            }}
          >
            <LogOut className="text-ink-3" />
            Log out
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
            <Trash2 />
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
          onConfirm={onConfirmDeleteAccount}
          onCancel={() => setConfirmDelete(false)}
          returnFocus={trigger}
        />
      )}
    </>
  );
}
