import { type ReactNode, type RefObject, useRef, useState } from 'react';

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
  // throw to show an error; the caller closes on success
  onConfirm: () => Promise<void>;
  onCancel: () => void;
  // for dialogs opened from a menu item, which is gone by the time the dialog closes
  returnFocus?: RefObject<HTMLElement | null>;
}

export function ConfirmDialog({
  title,
  message,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
  returnFocus,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const opener = useRef(document.activeElement as HTMLElement | null);

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
      <AlertDialogContent
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          (returnFocus ?? opener).current?.focus();
        }}
      >
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
