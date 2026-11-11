import { Fragment } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { TalkOrType } from '../components/TalkOrType';
import { Checkbox, ChipMulti, ChipSelect, Progress, useToast } from '../components/ui';
import { hasCrisisLanguage } from '../lib/safety';
import { useApp, useDraft } from '../lib/store';
import { formatDate, toISODate } from '../lib/dates';
import {
  FREQUENCY_CHOICES,
  IMPACT_CHOICES,
  ONSET_CHOICES,
  TRIED_CHOICES,
  TRIGGER_CHOICES,
} from '../lib/translate';

const TOPICS = ['Onset', 'Frequency', 'Severity', 'Triggers', 'Tried'];
const TOTAL = TOPICS.length;

/** Step 0: the opening, in the patient's own words. */
export function StoryIntro() {
  const navigate = useNavigate();
  const { draft, update } = useDraft();
  const latest = useApp((s) => s.summaries[s.summaries.length - 1]);

  const next = () => {
    if (hasCrisisLanguage(draft.opening)) {
      update({ opening: '' });
      navigate('/help/now', { replace: true });
      return;
    }
    navigate('/story/1');
  };

  return (
    <Shell header={{ kind: 'sub', title: 'Tell my story', back: '/home', right: <span /> }} tabs>
      <h1>What’s been going on?</h1>
      <p className="lead">In your own words: mood, sleep, worry, energy — whatever feels most important. Rough is fine.</p>
      {latest && (
        <p className="small muted">
          Your last story was saved {formatDate(toISODate(new Date(latest.createdAt)))}. Telling it again adds an update to your case.
        </p>
      )}
      <TalkOrType
        value={draft.opening}
        onChange={(opening) => update({ opening })}
        placeholder="Most days I…"
      />
      <button className="btn btn--primary btn--block" onClick={next}>Next</button>
      <p className="small muted">Your words stay on this device. Nothing is saved to your case until you say it looks right.</p>
    </Shell>
  );
}

/** Steps 1–5: Onset · Frequency · Severity · Triggers · Tried */
export function StoryStep() {
  const navigate = useNavigate();
  const step = Number(useParams().step);
  const { draft, update } = useDraft();
  const [toast, showToast] = useToast();

  if (!Number.isInteger(step) || step < 1 || step > TOTAL) return <Navigate to="/story" replace />;

  const go = (n: number) => navigate(n > TOTAL ? '/story/review' : `/story/${n}`);

  const textForStep = (): string | undefined =>
    [draft.onset.text, draft.frequency.text, draft.severity.text, draft.triggers.text, [draft.tried.text, draft.tried.outcome].join(' ')][step - 1];

  const clearStepText = () => {
    if (step === 1) update({ onset: { ...draft.onset, text: '' } });
    if (step === 2) update({ frequency: { ...draft.frequency, text: '' } });
    if (step === 3) update({ severity: { ...draft.severity, text: '' } });
    if (step === 4) update({ triggers: { ...draft.triggers, text: '' } });
    if (step === 5) update({ tried: { ...draft.tried, text: '', outcome: '' } });
  };

  const next = () => {
    if (hasCrisisLanguage(textForStep())) {
      clearStepText();
      navigate('/help/now', { replace: true });
      return;
    }
    go(step + 1);
  };

  const save = () => {
    showToast('Saved for this session');
    setTimeout(() => navigate('/home'), 600);
  };

  return (
    <Shell
      header={{
        kind: 'sub',
        title: `Step ${step} of ${TOTAL}`,
        onBack: () => navigate(step === 1 ? '/story' : `/story/${step - 1}`),
        back: '/story',
        right: <button className="header-link" onClick={save}>Save</button>,
      }}
    >
      <Progress step={step} total={TOTAL} />
      <p className="small muted" aria-hidden="true">
        {TOPICS.map((t, i) => (
          <Fragment key={t}>
            {i > 0 && ' · '}
            <span style={i === step - 1 ? { color: 'var(--ink)', fontWeight: 600 } : undefined}>{t}</span>
          </Fragment>
        ))}
      </p>

      {step === 1 && (
        <>
          <h1>When did this start?</h1>
          <p className="lead">A rough guess is fine.</p>
          <ChipSelect label="When it started" options={ONSET_CHOICES} value={draft.onset.choice} onChange={(choice) => update({ onset: { ...draft.onset, choice } })} />
          <Checkbox checked={!!draft.onset.afterMedChange} onChange={(afterMedChange) => update({ onset: { ...draft.onset, afterMedChange } })}>
            It started after a medication change
          </Checkbox>
          <TalkOrType value={draft.onset.text} onChange={(text) => update({ onset: { ...draft.onset, text } })} placeholder="It started around…" />
        </>
      )}

      {step === 2 && (
        <>
          <h1>How often does it happen?</h1>
          <p className="lead">There’s no wrong answer. Rough is fine.</p>
          <ChipSelect label="How often" options={FREQUENCY_CHOICES} value={draft.frequency.choice} onChange={(choice) => update({ frequency: { ...draft.frequency, choice } })} />
          <TalkOrType value={draft.frequency.text} onChange={(text) => update({ frequency: { ...draft.frequency, text } })} placeholder="It gets worse after…" />
        </>
      )}

      {step === 3 && (
        <>
          <h1>How much is it affecting you?</h1>
          <p className="lead">On most days, from 0 (not at all) to 10 (the worst it could be).</p>
          <div className="scale scale--11" role="group" aria-label="Severity from 0 to 10">
            {Array.from({ length: 11 }, (_, n) => (
              <button
                key={n}
                type="button"
                aria-pressed={draft.severity.score === n}
                onClick={() => update({ severity: { ...draft.severity, score: draft.severity.score === n ? undefined : n } })}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="row row--between small muted"><span>Not at all</span><span>Worst</span></div>
          <h3>What is it getting in the way of?</h3>
          <ChipMulti label="Affects" options={IMPACT_CHOICES} value={draft.severity.impacts} onChange={(impacts) => update({ severity: { ...draft.severity, impacts } })} />
          <TalkOrType value={draft.severity.text} onChange={(text) => update({ severity: { ...draft.severity, text } })} placeholder="I’ve stopped being able to…" />
        </>
      )}

      {step === 4 && (
        <>
          <h1>What makes it better or worse?</h1>
          <p className="lead">Pick any that fit.</p>
          <ChipMulti label="Triggers" options={TRIGGER_CHOICES} value={draft.triggers.choices} onChange={(choices) => update({ triggers: { ...draft.triggers, choices } })} />
          <TalkOrType value={draft.triggers.text} onChange={(text) => update({ triggers: { ...draft.triggers, text } })} placeholder="It’s worse when…" />
        </>
      )}

      {step === 5 && (
        <>
          <h1>What have you tried?</h1>
          <p className="lead">Anything counts — including nothing yet.</p>
          <ChipMulti label="Tried" options={TRIED_CHOICES} value={draft.tried.choices} onChange={(choices) => update({ tried: { ...draft.tried, choices } })} />
          {draft.tried.choices.includes('Medication') && (
            <div className="card card--soft">
              <div className="field">
                <label htmlFor="med">Medication name</label>
                <input id="med" className="input" value={draft.tried.medName} onChange={(e) => update({ tried: { ...draft.tried, medName: e.target.value } })} />
              </div>
              <div className="grid-2">
                <div className="field">
                  <label htmlFor="dose">Dose</label>
                  <input id="dose" className="input" placeholder="e.g. 20 mg" value={draft.tried.medDose} onChange={(e) => update({ tried: { ...draft.tried, medDose: e.target.value } })} />
                </div>
                <div className="field">
                  <label htmlFor="dur">How long</label>
                  <input id="dur" className="input" placeholder="e.g. 5 weeks" value={draft.tried.medDuration} onChange={(e) => update({ tried: { ...draft.tried, medDuration: e.target.value } })} />
                </div>
              </div>
              <div className="field">
                <label htmlFor="out">What happened?</label>
                <input id="out" className="input" placeholder="e.g. helped mood, but very drowsy" value={draft.tried.outcome} onChange={(e) => update({ tried: { ...draft.tried, outcome: e.target.value } })} />
              </div>
            </div>
          )}
          <TalkOrType value={draft.tried.text} onChange={(text) => update({ tried: { ...draft.tried, text } })} placeholder="I tried…" />
        </>
      )}

      <button className="btn btn--primary btn--block" onClick={next}>{step === TOTAL ? 'See it in doctor terms' : 'Next'}</button>
      {/* Skip runs the same crisis check as Next, so typed crisis text can never ride into the summary or brief. */}
      <button className="btn btn--block" onClick={next}>Skip - I am not sure</button>
      {toast}
    </Shell>
  );
}
