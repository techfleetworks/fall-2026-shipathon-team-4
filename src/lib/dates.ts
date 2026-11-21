export const todayISO = () => toISODate(new Date());

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(iso: string, days: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatDate(iso?: string): string {
  if (!iso) return '';
  return parseISO(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatShort(iso?: string): string {
  if (!iso) return '';
  return parseISO(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function daysUntil(iso: string): number {
  const ms = parseISO(iso).getTime() - parseISO(todayISO()).getTime();
  return Math.round(ms / 86_400_000);
}

/**
 * How long ago a date was, in the simplest unit: "Today", "Yesterday", "5 days ago", "3 weeks ago",
 * "4 months ago", "2 years ago". Days up to 2 weeks, weeks up to 2 months, months up to 2 years.
 */
export function timeAgo(iso: string, today: string = todayISO()): string {
  const days = Math.round((parseISO(today).getTime() - parseISO(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  const a = parseISO(iso), b = parseISO(today);
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months -= 1;
  months = Math.max(2, months);
  if (months < 24) return `${months} months ago`;
  return `${Math.floor(months / 12)} years ago`;
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
