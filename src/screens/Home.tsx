import { Link } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { daysUntil, formatDate, toISODate, todayISO } from '../lib/dates';
import {
  selectDueFollowUps,
  selectLatestSummary,
  selectUpcomingVisit,
  selectVisitNeedingCheckIn,
  useApp,
} from '../lib/store';

export function Home() {
  const state = useApp();
  const { profile, savedScripts } = state;
  const latest = selectLatestSummary(state);
  const upcoming = selectUpcomingVisit(state);
  const needsCheckIn = selectVisitNeedingCheckIn(state);
  const due = selectDueFollowUps(state);
  const today = todayISO();

  const briefSteps = [!!latest, !!upcoming && upcoming.priorities.length > 0, !!upcoming && upcoming.askingFor.length > 0];
  const briefPct = Math.round((briefSteps.filter(Boolean).length / briefSteps.length) * 100);

  // One clear next action, in priority order.
  let next: { label: string; title: string; body: string; cta: string; to: string };
  if (due.length) {
    next = { label: 'Follow up', title: `Did the ${due[0].step.toLowerCase()} happen?`, body: `It was due ${formatDate(due[0].dueDate)}. Log it so your case stays complete.`, cta: 'Log the outcome', to: `/follow-up/${due[0].id}` };
  } else if (needsCheckIn && needsCheckIn.date < today) {
    next = { label: 'After your visit', title: 'How did it go?', body: '30 seconds. It helps you follow up and helps people like you.', cta: 'Start check-in', to: `/visits/${needsCheckIn.id}/check-in` };
  } else if (upcoming && upcoming.date === today) {
    next = { label: 'Today', title: 'It’s visit day', body: 'Three small things before you go. Skip any.', cta: 'Morning-of prep', to: '/today' };
  } else if (!latest) {
    next = { label: 'Start here', title: 'Tell your story - in your own words', body: 'Talk or type. We’ll turn it into something your doctor understands.', cta: 'Tell my story', to: '/story' };
  } else if (upcoming && briefPct === 100) {
    next = { label: 'Next up', title: 'Your brief is ready', body: 'Pick one script to practice so the words come easily in the room.', cta: 'Practice a script', to: '/scripts?saved=1' };
  } else if (upcoming) {
    next ={ label: 'Next up', title: 'Get your one-page brief ready', body: 'Pick your top 3 priorities so you lead with what matters most.', cta: 'Open my brief', to: '/brief' };
  } else {
    next = { label: 'Next up', title: 'Add your next visit', body: 'We’ll help you prepare and remind you on the day.', cta: 'Add a visit date', to: '/visits' };
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

      {upcoming ? (
        <Link to="/brief" className="card card--soft card--link">
          <span className="card__title">
            Next visit · {formatDate(upcoming.date)}
            {daysUntil(upcoming.date) >= 0 && <span className="muted small"> · in {daysUntil(upcoming.date)} days</span>}
          </span>
          <span>Prepare my one-page brief</span>
          <div className="skeleton" style={{ background: 'var(--skeleton)' }}>
            <div className="skeleton" style={{ width: `${briefPct}%`, background: 'var(--primary)' }} />
          </div>
          <span className="small muted">{briefPct}% ready</span>
        </Link>
      ) : (
        <Link to="/visits" className="card card--soft card--link">
          <span className="card__title">Next visit · not set</span>
          <span>Add a date to start preparing</span>
        </Link>
      )}

      <Link to="/scripts" className="card card--soft card--link">
        <span className="card__title">Scripts</span>
        <span>What to say if I’m dismissed</span>
        <span className="small muted">{savedScripts.length ? `${savedScripts.length} saved` : 'Browse the library'}</span>
      </Link>

      <Link to="/case" className="card card--soft card--link">
        <span className="card__title">My case</span>
        <span>
          Doctor-ready summary · {latest ? `updated ${formatDate(toISODate(new Date(latest.createdAt)))}` : 'not started yet'}
        </span>
      </Link>
    </Shell>
  );
}
