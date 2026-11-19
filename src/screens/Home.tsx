import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { PLAYBOOKS } from '../data/playbooks';
import { daysUntil, formatDate, formatShort, parseISO, todayISO } from '../lib/dates';
import { draftPlaybook } from '../lib/playbook';
import {
  selectDueFollowUps,
  selectLatestSummary,
  selectUpcomingVisit,
  selectVisitNeedingCheckIn,
  useApp,
} from '../lib/store';
import { beforeSteps, formatTime } from './visit/common';

/** "Remind later" hides the next step until tomorrow. Per-device convenience only. */
const SNOOZE_KEY = 'home-next-step-snooze';
function readSnooze(): { to: string; until: string } | null {
  try { return JSON.parse(localStorage.getItem(SNOOZE_KEY) ?? 'null'); } catch { return null; }
}

/** "Today", "Yesterday", "3 days ago", then "Oct 2". */
function whenLabel(iso: string): string {
  const days = -daysUntil(iso.slice(0, 10));
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return formatShort(iso.slice(0, 10));
}

/** H1 · Home: dashboard — one clear next action, driven by the visit date. */
export function Home() {
  const state = useApp();
  const { profile } = state;
  const latest = selectLatestSummary(state);
  const upcoming = selectUpcomingVisit(state);
  const needsCheckIn = selectVisitNeedingCheckIn(state);
  const prefs = state.notifications ?? { prepReminders: true, morningOf: true, followUps: true };
  const due = prefs.followUps ? selectDueFollowUps(state) : [];
  const today = todayISO();
  const [snooze, setSnooze] = useState(readSnooze);

  const firstName = profile?.name?.trim().split(/\s+/)[0];
  const days = upcoming ? daysUntil(upcoming.date) : undefined;
  const headline = days === undefined
    ? 'Let’s get ready for your next visit.'
    : days <= 0 ? 'Your next visit is today.'
      : days === 1 ? 'Your next visit is tomorrow.'
        : `Your next visit is in ${days} days.`;

  const activity = [
    ...state.evidence.map((e) => ({ id: e.id, date: e.date, text: `${e.title}: ${e.detail}`, to: '/visits/history' })),
    ...(state.myPlaybooks ?? []).map((p) => ({ id: p.id, date: p.createdAt, text: `Playbook made: ${p.title}`, to: `/playbooks/mine/${p.id}` })),
    ...state.sharedTips.map((t) => ({ id: t.id, date: t.createdAt, text: t.rating ? `Rated a playbook: helped ${t.rating.toLowerCase()}` : 'Shared a tip', to: '/playbooks/others' })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);

  // "Before the visit": the three things that make the doctor summary ready.
  // Name how I feel, talking points, and Before you go.
  const beforeDone = upcoming ? [0, 2, 3].map((i) => beforeSteps(state, upcoming)[i].done) : [false, false, false];
  const doneCount = beforeDone.filter(Boolean).length;
  const forDoctor = upcoming?.clinician ? ` for ${upcoming.clinician}` : '';

  // One clear next action, in priority order.
  let next: { title: string; body: string; cta: string; to: string };
  if (due.length) {
    next = { title: `Did the ${due[0].step.toLowerCase()} happen?`, body: `It was due ${formatDate(due[0].dueDate)}. Log it so your record stays complete.`, cta: 'Log the outcome', to: `/follow-up/${due[0].id}` };
  } else if (needsCheckIn && needsCheckIn.date < today) {
    next = { title: 'How did your visit go?', body: 'About 30 seconds. It helps you follow up, and helps people like you.', cta: 'Start check-in', to: `/visits/${needsCheckIn.id}/after` };
  } else if (prefs.morningOf && upcoming && upcoming.date === today) {
    next = { title: 'It’s visit day.', body: 'Three small things before you go. Skip any.', cta: 'Start now', to: `/visits/${upcoming.id}/before/today` };
  } else if (upcoming ? !beforeDone[0] : !latest) {
    next = { title: 'Tell us how you’ve been feeling recently.', body: `About 3 minutes. We’ll add it to your summary${forDoctor}.`, cta: 'Review', to: upcoming ? `/visits/${upcoming.id}/before` : '/visits/new' };
  } else if (upcoming && doneCount < 3) {
    next = { title: 'Pick your talking points.', body: `About 2 minutes. Lead with what matters most${forDoctor ? ` to ${upcoming.clinician}` : ''}.`, cta: 'Start now', to: `/visits/${upcoming.id}/before/brief` };
  } else if (upcoming) {
    next = { title: 'Practice what you’ll say.', body: 'About 3 minutes. A playbook makes the words come easily in the room.', cta: 'Start now', to: '/playbooks' };
  } else {
    next = { title: 'Add your next visit.', body: 'We’ll help you prepare, and remind you on the day.', cta: 'Add a visit', to: '/visits/new' };
  }
  const snoozed = !!snooze && snooze.to === next.to && snooze.until > today;
  const remindLater = () => {
    const s = { to: next.to, until: new Date(parseISO(today).getTime() + 86_400_000).toISOString().slice(0, 10) };
    try { localStorage.setItem(SNOOZE_KEY, JSON.stringify(s)); } catch { /* still hide it for now */ }
    setSnooze(s);
  };
  const showNow = () => {
    try { localStorage.removeItem(SNOOZE_KEY); } catch { /* ignore */ }
    setSnooze(null);
  };

  // Suggested tip: the others' playbook that best fits what this person has said.
  const tip = PLAYBOOKS.find((p) => p.id === draftPlaybook(state).peerPlaybookId) ?? PLAYBOOKS[0];

  return (
    <Shell header={{ kind: 'brand' }} tabs>
      <div className="home">
        <h1>Hi{firstName ? ` ${firstName}` : ''}. {headline}</h1>

        <div className="home-grid">
          <section className="panel home-visit" aria-labelledby="visit-title">
            <span className="eyebrow-soft">Upcoming visit</span>
            {upcoming ? (
              <>
                <h2 id="visit-title" className="home-visit__when">
                  {parseISO(upcoming.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  {upcoming.time ? ` · ${formatTime(upcoming.time)}` : ''}
                </h2>
                {(upcoming.clinician || upcoming.specialty) && (
                  <p style={{ margin: 0 }}>{[upcoming.clinician, upcoming.specialty].filter(Boolean).join(' · ')}</p>
                )}
                <div className="home-progress" role="img" aria-label={`Before the visit: ${doneCount} of 3 steps done`}>
                  {beforeDone.map((d, i) => <span key={i} className={d ? 'on' : ''} />)}
                </div>
                <span className="small muted">Before the visit: {doneCount} of 3 steps done</span>
                <Link to="/visits" className="btn btn--outline btn--block">View upcoming visits</Link>
              </>
            ) : (
              <>
                <h2 id="visit-title" className="home-visit__when">Not set yet</h2>
                <p className="muted" style={{ margin: 0 }}>Add a date and we’ll help you get ready.</p>
                <Link to="/visits/new" className="btn btn--outline btn--block">Add a visit</Link>
              </>
            )}
          </section>

          <section className="panel panel--accent home-next" aria-labelledby="next-title">
            <span className="eyebrow-soft">Next step</span>
            {snoozed ? (
              <>
                <p id="next-title" style={{ margin: 0 }}>We’ll remind you tomorrow.</p>
                <button className="link-btn" style={{ alignSelf: 'flex-start', padding: '4px 0' }} onClick={showNow}>Show it now</button>
              </>
            ) : (
              <>
                <h2 id="next-title" className="home-next__title">{next.title}</h2>
                <p className="muted" style={{ margin: 0 }}>{next.body}</p>
                <div className="btn-row">
                  <Link to={next.to} className="btn btn--primary">{next.cta}</Link>
                  <button className="link-btn" onClick={remindLater}>Remind later</button>
                </div>
              </>
            )}
          </section>

          <section className="panel home-tip" aria-labelledby="tip-title">
            <span className="eyebrow-soft">Suggested: What helped others</span>
            <h2 id="tip-title" className="home-tip__title">{tip.title}</h2>
            <p className="muted" style={{ margin: 0 }}>Saved by {tip.helped.of} people like you</p>
            <Link to={`/playbooks/others/${tip.id}`} className="home-tip__open">Open</Link>
          </section>
          <section className="panel" aria-labelledby="activity-title">
            <span id="activity-title" className="eyebrow-soft">Recent activity</span>
            {activity.length === 0 ? (
              <p className="small muted" style={{ margin: 0 }}>What you save shows up here: stories, visits, playbooks and check-ins.</p>
            ) : (
              <ul className="home-activity">
                {activity.map((a) => (
                  <li key={a.id}>
                    <Link to={a.to}>{a.text}</Link>
                    <span className="muted">{whenLabel(a.date)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

        </div>
      </div>
    </Shell>
  );
}
