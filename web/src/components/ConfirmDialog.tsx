import { type ReactNode, useEffect } from 'react';

import { createPortal } from 'react-dom';

interface Props {
  eyebrow: string; // small rose label, e.g. "delete crawl"
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

// Shared centered destructive-confirm modal (Esc + backdrop-click to dismiss)
export function ConfirmDialog({
  eyebrow,
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
      <div
        className="fixed inset-0 z-40 bg-ink-900/70 backdrop-blur-sm"
        onClick={busy ? undefined : onCancel}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label={title}
          className="w-full max-w-md border border-ink-500/70 bg-ink-800 shadow-2xl"
        >
          <header className="border-b border-ink-500/70 px-6 py-5">
            <div className="font-mono text-[10px] uppercase tracking-widest text-rose-300">
              {eyebrow}
            </div>
            <h2 className="display mt-1 text-lg font-normal">{title}</h2>
          </header>

          <div className="px-6 py-5">
            <p className="text-sm leading-relaxed text-ink-300">{message}</p>

            {children}

            {error && (
              <div className="mt-4 border-l-2 border-rose-500 bg-rose-500/5 px-4 py-2.5 font-mono text-xs text-rose-200">
                {error}
              </div>
            )}
          </div>

          <footer className="flex justify-end gap-3 border-t border-ink-500/70 px-6 py-4">
            <button
              onClick={onCancel}
              disabled={busy}
              className="border border-ink-500/70 px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-ink-300 transition hover:bg-ink-600/40 hover:text-paper disabled:cursor-not-allowed disabled:opacity-40"
            >
              cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={busy}
              className="border border-rose-400/50 bg-rose-500/10 px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-rose-200 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? (busyLabel ?? 'working…') : confirmLabel}
            </button>
          </footer>
        </div>
      </div>
    </>,
    document.body,
  );
}
