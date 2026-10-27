export function toCsv(header: string[], rows: (string | number | null)[][]): string {
  const cell = (v: string | number | null) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
}

export function downloadCsv(filename: string, csv: string) {
  // BOM so Excel reads UTF-8
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(href);
}
