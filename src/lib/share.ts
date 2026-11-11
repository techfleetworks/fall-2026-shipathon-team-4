import { formatDate } from './dates';
import type { AppData } from './store';
import { selectLatestSummary, selectUpcomingVisit } from './store';
import { APP_NAME } from './brand';

/** Plain-text version of the brief/case for the share sheet or clipboard. */
export function caseAsText(s: AppData): string {
  const latest = selectLatestSummary(s);
  const visit = selectUpcomingVisit(s);
  const lines: string[] = [];
  lines.push(`Patient summary${s.profile?.name ? ` — ${s.profile.name}` : ''}${s.profile?.age ? `, ${s.profile.age}` : ''}`);
  if (visit) lines.push(`Visit: ${formatDate(visit.date)}`);
  if (visit?.priorities.length) {
    lines.push('', 'Top priorities:');
    visit.priorities.forEach((p, i) => lines.push(`${i + 1}. ${p}`));
  }
  if (latest) {
    lines.push('', 'Symptoms (patient-reported):');
    latest.fields.forEach((f) => f.clinical !== 'Not discussed' && lines.push(`- ${f.label}: ${f.clinical}`));
  }
  if (visit?.askingFor.length) lines.push('', `Asking for: ${visit.askingFor.join(', ')}`);
  lines.push('', `Prepared by the patient with ${APP_NAME}. Patient-reported.`);
  if (s.demoMode) lines.push('Synthetic — illustrative only, not medical advice.');
  return lines.join('\n');
}

/** Returns a message for a toast. */
export async function shareText(title: string, text: string): Promise<string> {
  try {
    if (navigator.share) {
      await navigator.share({ title, text });
      return 'Shared';
    }
    await navigator.clipboard.writeText(text);
    return 'Copied — paste it into a message or patient portal';
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return 'Share cancelled';
    return 'Couldn’t share on this device';
  }
}
