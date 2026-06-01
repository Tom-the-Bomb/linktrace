// Shared display helpers: human date/time formatting and error-message extraction.

// renders an ISO timestamp for display. With `withTime` it also shows the
// clock time. Empty input renders as a dash; an unparseable value falls back to the raw
// string so we never show "Invalid Date".
export function formatDate(iso: string, withTime = false): string {
  if (!iso) return '-';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  });
}

// pulls a string message out of an unknown caught value.
export function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
