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

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
