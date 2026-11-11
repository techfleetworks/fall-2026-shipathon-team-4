import { formatDate, formatShort } from './dates';
import type { AppData } from './store';
import { selectLatestSummary, selectUpcomingVisit } from './store';
import type { BriefSnapshot, Visit } from './types';

/** Everything the doctor view shows, as plain data — used live and frozen into share links. */
export function buildBriefSnapshot(
  s: AppData,
  forVisit?: Visit,
  include: { talkingPoints: boolean; summary: boolean } = { talkingPoints: true, summary: true },
): BriefSnapshot {
  const latest = selectLatestSummary(s);
  const visit = forVisit ?? selectUpcomingVisit(s);
  const field = (k: string) => latest?.fields.find((f) => f.key === k);
  const tried = field('tried');
  return {
    includeTalkingPoints: include.talkingPoints,
    includeSummary: include.summary,
    who: [[s.profile?.name, s.profile?.age].filter(Boolean).join(', '), visit && `Visit ${formatShort(visit.date)}`].filter(Boolean).join(' · '),
    visitDate: visit?.date,
    priorities: include.talkingPoints ? (visit?.priorities ?? []) : [],
    symptoms: !include.summary ? [] : ['symptoms', 'onset', 'frequency', 'severity', 'triggers']
      .map(field)
      .filter((f): f is NonNullable<typeof f> => !!f && f.clinical !== 'Not discussed')
      .map((f) => ({ label: f.key === 'symptoms' ? 'Reported' : f.label, clinical: f.clinical, quote: f.quote })),
    tried: !include.summary
      ? ''
      : tried && tried.clinical !== 'Not discussed'
        ? tried.clinical
        : s.medications.map((m) => `${m.name}${m.dose ? ` ${m.dose}` : ''} since ${formatDate(m.started)}`).join('; ') || 'Not discussed',
    timeline: !include.summary ? [] : [...s.evidence]
      .sort((a, b) => a.date.localeCompare(b.date))
      .filter((e) => e.type !== 'note')
      .slice(-5)
      .map((e) => ({ date: e.date, detail: e.detail })),
    askingFor: include.talkingPoints ? (visit?.askingFor ?? []) : [],
    demo: s.demoMode,
  };
}
