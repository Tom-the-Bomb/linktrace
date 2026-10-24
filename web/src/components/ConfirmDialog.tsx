import { type ReactNode, useEffect, useRef } from 'react';

import { createPortal } from 'react-dom';

interface Props {
  title: string;
  message: ReactNode;
  children?: ReactNode; // detail block under the message
  confirmLabel: string;
  busyLabel?: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

// Shared centered destructive-confirm dialog (Esc + backdrop-click to dismiss)
export function ConfirmDialog({
  title,
  message,
  children,
  confirmLabel,
  busyLabel,
  busy,
  error,
  onConfirm,
  onCancel,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // safe default: focus lands on cancel, not the destructive action
    const prev = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => prev?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, busy]);

  // portal to <body> so a transform/filter ancestor can't become the containing block and break centering
  return createPortal(
    <>
      <div className="fixed inset-0 z-40 bg-ink/30" onClick={busy ? undefined : onCancel} />
      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          className="pointer-events-auto w-full max-w-md animate-row-in rounded-panel bg-panel shadow-lift"
        >
          <div className="px-6 pb-5 pt-6">
            <h2 id="confirm-title" className="text-xl font-semibold tracking-[-0.03em]">
              {title}
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{message}</p>
            {children}
            {error && (
              <p
                role="alert"
                className="mt-4 rounded-control bg-bad-bg px-4 py-2.5 text-sm font-medium text-bad-fg"
              >
                {error}
              </p>
            )}
          </div>
          <footer className="flex justify-end gap-2 rounded-b-panel border-t border-line bg-sunken/60 px-6 py-4">
            <button
              ref={cancelRef}
              onClick={onCancel}
              disabled={busy}
              className="btn-secondary h-10 px-4 text-sm"
            >
              Cancel
            </button>
            <button onClick={onConfirm} disabled={busy} className="btn-danger h-10 px-4 text-sm">
              {busy ? (busyLabel ?? 'Working…') : confirmLabel}
            </button>
          </footer>
        </div>
      </div>
    </>,
    document.body,
  );
}
