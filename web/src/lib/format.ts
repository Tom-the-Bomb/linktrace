// ISO timestamp -> localized date (+ time if withTime); '-' if empty, raw string if unparseable.
export function formatDate(iso: string, withTime = false): string {
  if (!iso) {
    return '-';
  }
  const date = new Date(iso);
  if (isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  });
}

export function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
