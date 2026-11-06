import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { Checkbox, ChipMulti, Progress } from '../components/ui';
import { todayISO } from '../lib/dates';
import { useApp } from '../lib/store';
import type { ForWhom, Reason } from '../lib/types';

const REASONS: Reason[] = ['Low mood', 'Worry', 'Both', 'Not sure'];
const TOTAL = 5;

export function Onboarding() {
  const navigate = useNavigate();
  const complete = useApp((s) => s.completeOnboarding);
  const [step, setStep] = useState(1);
  const [forWhom, setForWhom] = useState<ForWhom>();
  const [reasons, setReasons] = useState<Reason[]>([]);
  const [consent, setConsent] = useState(false);
  const [adult, setAdult] = useState(false);
  const [name, setName] = useState('');
  const [visit, setVisit] = useState('');

  const back = () => (step === 1 ? navigate('/') : setStep(step - 1));
  const finish = (withVisit: boolean) => {
    complete(
      { name: name.trim(), forWhom: forWhom ?? 'myself', reasons, consentAccepted: true },
      withVisit && visit ? visit : undefined,
    );
    navigate('/home', { replace: true });
  };

  return (
    <Shell header={{ kind: 'sub', title: `Step ${step} of ${TOTAL}`, back: '/', onBack: back, right: <span /> }}>
      <Progress step={step} total={TOTAL} />

      {step === 1 && (
        <>
          <h1>Who is this for?</h1>
          <p className="lead">You can change this later.</p>
          <div className="stack">
            <button className={`btn btn--block${forWhom === 'myself' ? ' btn--primary' : ''}`} onClick={() => { setForWhom('myself'); setStep(2); }}>
              Myself
            </button>
            <button className="btn btn--block" onClick={() => navigate('/caregiver')}>
              Someone I am supporting
            </button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <h1>What brings you here?</h1>
          <p className="lead">Pick any that fit. There’s no wrong answer.</p>
          <ChipMulti
            label="What brings you here"
            options={REASONS}
            value={reasons}
            onChange={(v) => setReasons(v as Reason[])}
          />
          <button className="btn btn--primary btn--block" onClick={() => setStep(3)}>Next</button>
          <button className="btn btn--block" onClick={() => { setReasons(['Not sure']); setStep(3); }}>Skip - I am not sure</button>
        </>
      )}

      {step === 3 && (
        <>
          <h1>Your privacy, in plain words</h1>
          <div className="card card--muted">
            <ul className="list">
              <li><strong>Free for you, always.</strong> We never sell your data or show ads.</li>
              <li><strong>On this device only.</strong> In this version, nothing you enter leaves your phone or computer.</li>
              <li><strong>You decide what to share.</strong> Nothing goes to your doctor unless you show or send it.</li>
              <li><strong>Delete anytime.</strong> Settings → Delete everything removes it all.</li>
            </ul>
          </div>
          <div className="card card--soft">
            <p className="small">
              Get Heard helps you describe what you’re experiencing. It does not diagnose and does not give medical advice.
              If you are in crisis, call or text 988.
            </p>
          </div>
          <Checkbox checked={adult} onChange={setAdult}>I’m 18 or older and in the US</Checkbox>
          <Checkbox checked={consent} onChange={setConsent}>I understand and want to continue</Checkbox>
          <button className="btn btn--primary btn--block" disabled={!consent || !adult} onClick={() => setStep(4)}>Continue</button>
        </>
      )}

      {step === 4 && (
        <>
          <h1>What should we call you?</h1>
          <p className="lead">A first name or nickname is fine. Optional.</p>
          <div className="field">
            <label htmlFor="name">Name</label>
            <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" />
          </div>
          <button className="btn btn--primary btn--block" onClick={() => setStep(5)}>Next</button>
        </>
      )}

      {step === 5 && (
        <>
          <h1>When is your next visit?</h1>
          <p className="lead">Optional. We’ll use it to remind you to prepare and to time your morning-of checklist.</p>
          <div className="field">
            <label htmlFor="visit">Visit date</label>
            <input id="visit" type="date" className="input" min={todayISO()} value={visit} onChange={(e) => setVisit(e.target.value)} />
          </div>
          <button className="btn btn--primary btn--block" disabled={!visit} onClick={() => finish(true)}>Save and continue</button>
          <button className="btn btn--block" onClick={() => finish(false)}>I don’t have one yet</button>
        </>
      )}
    </Shell>
  );
}
