import { type ReactNode, useState } from 'react';

import { errMessage } from '../lib/format';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';

interface Props {
  title: string;
  message: ReactNode;
  children?: ReactNode;
  confirmLabel: string;
  // throws to show its error; closing on success is up to the caller
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

// destructive confirm; Esc cancels unless busy, and focus starts on Cancel
export function ConfirmDialog({
  title,
  message,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open onOpenChange={(open) => !open && !busy && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
          {children}
          {error && (
            <p
              role="alert"
              className="rounded-control bg-bad-bg text-bad-fg mt-4 px-4 py-2.5 text-sm font-medium"
            >
              {error}
            </p>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          {/* stays open while the delete runs, so errors can show */}
          <AlertDialogAction
            variant="destructive"
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              void confirm();
            }}
          >
            {busy ? 'Deleting…' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
