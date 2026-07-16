const KB = 1024;
const UNITS = ['Б', 'КБ', 'МБ', 'ГБ'] as const;

/**
 * Human-readable file size, binary units (1 КБ = 1024 Б) — the same convention the
 * 100 МБ upload cap uses, so a file the API accepted never reads as "100.1 МБ" here.
 *
 * One decimal from КБ up, none for bytes: "1,5 КБ" is useful, "1,5 Б" is nonsense.
 */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < KB) return `${bytes} ${UNITS[0]}`;

  let value = bytes;
  let unit = 0;
  while (value >= KB && unit < UNITS.length - 1) {
    value /= KB;
    unit += 1;
  }

  // ru-RU renders the decimal separator as a comma, matching the rest of the UI.
  return `${value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} ${UNITS[unit]}`;
}
