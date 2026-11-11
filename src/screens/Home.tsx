import { Link } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { daysUntil, formatDate, todayISO } from '../lib/dates';
import {
  selectDueFollowUps,
  selectLatestSummary,
  selectUpcomingVisit,
  selectVisitNeedingCheckIn,
  useApp,
} from '../lib/store';

export function Home() {
  const state = useApp();
  const { profile } = state;
  const latest = selectLatestSummary(state);
  const upcoming = selectUpcomingVisit(state);
  const needsCheckIn = selectVisitNeedingCheckIn(state);
  const prefs = state.notifications ?? { prepReminders: true, morningOf: true, followUps: true };
  const due = prefs.followUps ? selectDueFollowUps(state) : [];
  const today = todayISO();

  const activity = [
    ...state.evidence.map((e) => ({ id: e.id, date: e.date, title: e.title, detail: e.detail, to: '/visits/history' })),
    ...(state.myPlaybooks ?? []).map((p) => ({ id: p.id, date: p.createdAt.slice(0, 10), title: 'Playbook made', detail: p.title, to: `/playbooks/mine/${p.id}` })),
    ...state.sharedTips.map((t) => ({ id: t.id, date: t.createdAt.slice(0, 10), title: 'Rated a playbook', detail: t.rating ? `Helped: ${t.rating.toLowerCase()}` : 'Shared a tip', to: '/playbooks/others' })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  const briefSteps = [!!latest, !!upcoming && upcoming.priorities.length > 0, !!upcoming && upcoming.askingFor.length > 0];
  const briefPct = Math.round((briefSteps.filter(Boolean).length / briefSteps.length) * 100);

  // One clear next action, in priority order.
  let next: { label: string; title: string; body: string; cta: string; to: string };
  if (due.length) {
    next = { label: 'Follow up', title: `Did the ${due[0].step.toLowerCase()} happen?`, body: `It was due ${formatDate(due[0].dueDate)}. Log it so your case stays complete.`, cta: 'Log the outcome', to: `/follow-up/${due[0].id}` };
  } else if (needsCheckIn && needsCheckIn.date < today) {
    next = { label: 'After your visit', title: 'How did it go?', body: '30 seconds. It helps you follow up and helps people like you.', cta: 'Start check-in', to: `/visits/${needsCheckIn.id}/after` };
  } else if (prefs.morningOf && upcoming && upcoming.date === today) {
    next = { label: 'Today', title: 'It’s visit day', body: 'Three small things before you go. Skip any.', cta: 'Open my visit', to: `/visits/${upcoming.id}/before/today` };
  } else if (!latest) {
    next = { label: 'Start here', title: 'Name how you feel, in your own words', body: 'Talk or type. We’ll turn it into something your doctor understands.', cta: 'Name how I feel', to: upcoming ? `/visits/${upcoming.id}/before` : '/visits/new' };
  } else if (upcoming && briefPct === 100) {
    next = { label: 'Next up', title: 'Your brief is ready', body: 'Make a playbook and practice it, so the words come easily in the room.', cta: 'Make my playbook', to: '/playbooks/new' };
  } else if (upcoming) {
    next ={ label: 'Next up', title: 'Pick your talking points', body: 'Choose your top 3 so you lead with what matters most.', cta: 'Continue prep', to: `/visits/${upcoming.id}/before/brief` };
  } else {
    next = { label: 'Next up', title: 'Add your next visit', body: 'We’ll help you prepare and remind you on the day.', cta: 'Add a visit', to: '/visits/new' };
  }

  return (
    <Shell header={{ kind: 'brand' }} tabs>
      <h1>Hi{profile?.name ? ` ${profile.name}` : ''}! What do you want to get ready today?</h1>

      <section className="card card--feature" aria-labelledby="next-title">
        <span className="card__label">{next.label}</span>
        <h2 id="next-title" style={{ fontSize: '1.05rem' }}>{next.title}</h2>
        <p>{next.body}</p>
        <Link to={next.to} className="btn btn--primary btn--block">{next.cta}</Link>
      </section>

      <h2 className="section-label">Upcoming visit</h2>
      {upcoming ? (
        <Link to={`/visits/${upcoming.id}/before`} className="card card--soft card--link">
          <span className="card__title">
            {formatDate(upcoming.date)}{upcoming.clinician ? ` · ${upcoming.clinician}` : ''}
            {daysUntil(upcoming.date) > 0 && <span className="muted small"> · in {daysUntil(upcoming.date)} days</span>}
            {daysUntil(upcoming.date) === 0 && <span className="muted small"> · today</span>}
          </span>
          <span>Get ready: before, at and after your appointment</span>
          <div className="skeleton" style={{ background: 'var(--skeleton)' }}>
            <div className="skeleton" style={{ width: `${briefPct}%`, background: 'var(--primary)' }} />
          </div>
          <span className="small muted">Brief {briefPct}% ready</span>
        </Link>
      ) : (
        <Link to="/visits/new" className="card card--soft card--link">
          <span className="card__title">Not set yet</span>
          <span>Add a date to start preparing</span>
        </Link>
      )}

      <h2 className="section-label">Recent activity</h2>
      {activity.length === 0 ? (
        <p className="small muted">What you save shows up here: stories, visits, playbooks and follow-ups.</p>
      ) : (
        <ul className="activity">
          {activity.map((a) => (
            <li key={a.id}>
              <Link to={a.to}>
                <span className="activity__date">{formatDate(a.date)}</span>
                <span><strong>{a.title}</strong> · {a.detail}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
