export function formatDate(iso: string, withTime = false): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  });
}

export function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
