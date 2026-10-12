// Small shared formatting helpers used across both surfaces (the console and the shipped app).

export function formatCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '—';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) {
    return iso;
  }
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) {
    return 'just now';
  }
  const mins = Math.round(secs / 60);
  if (mins < 60) {
    return `${mins} minute${mins > 1 ? 's' : ''} ago`;
  }
  const hrs = Math.round(mins / 60);
  if (hrs < 24) {
    return `${hrs} hour${hrs > 1 ? 's' : ''} ago`;
  }
  const days = Math.round(hrs / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}
