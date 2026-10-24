import { type RefObject, useEffect } from 'react';

// "/" or Cmd/Ctrl+K focuses the given input from anywhere, unless the user is already typing
export function useFocusShortcut(ref: RefObject<HTMLInputElement>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;
      const isSlash = e.key === '/' && !typing && !e.metaKey && !e.ctrlKey;
      const isCmdK = e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey);
      if (isSlash || isCmdK) {
        e.preventDefault();
        ref.current?.focus();
        ref.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ref]);
}
