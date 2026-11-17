import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PrivacyArt } from '../../components/Art';
import { PublicLayout } from '../../components/PublicLayout';
import { hasRecoverySession, setNewPassword } from '../../lib/auth';
import { supabase } from '../../lib/supabaseClient';

/**
 * /reset-password (ADR-023): opened from the "reset your password" email. Supabase reads the link and starts a short
 * recovery session; the person chooses a new password, it's saved, and they log in with it as usual.
 * Uses the same layout and form classes as the log-in screen. Wording is a draft for Diana and Dominic.
 */
export function ResetPassword() {
  const navigate = useNavigate();
  const [state, setState] = useState<'checking' | 'ready' | 'expired'>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let done = false;
    // Supabase finishes reading the link a moment after the page loads, and says so with PASSWORD_RECOVERY.
    const sub = supabase?.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' && !done) { done = true; setState('ready'); }
    });
    const t = setTimeout(async () => {
      if (done) return;
      done = true;
      setState((await hasRecoverySession()) ? 'ready' : 'expired');
    }, 1500);
    return () => { clearTimeout(t); sub?.data.subscription.unsubscribe(); };
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const out = await setNewPassword(password, confirm);
    setBusy(false);
    if (out.status === 'ok') return navigate('/login?reset=done', { replace: true });
    if (out.status === 'expired') return setState('expired');
    if (out.status === 'not-configured') return setError('Password reset isn’t available right now.');
    setError(out.message);
  };

  return (
    <PublicLayout footer={false}>
      <main id="main" className="auth">
        <section className="auth-side">
          <h1>Choose a new password.</h1>
          <p className="pub-sub" style={{ fontSize: '1.05rem' }}>Then log in as usual. Your saved information stays as it is.</p>
          <div className="art auth-art"><PrivacyArt /></div>
        </section>

        <section className="auth-form">
          {state === 'checking' && <p className="form-note" role="status" aria-busy="true">Checking your reset link…</p>}

          {state === 'expired' && (
            <div className="stack-sm" role="alert">
              <h2 style={{ margin: 0 }}>This link has expired</h2>
              <p className="form-note" style={{ margin: 0 }}>Reset links work once and only for a short time. Ask for a new one from the log-in page.</p>
              <Link to="/login?reset=1" className="btn btn--primary" style={{ alignSelf: 'flex-start' }}>Get a new link</Link>
            </div>
          )}

          {state === 'ready' && (
            <form onSubmit={submit} noValidate>
              <div className="field">
                <label htmlFor="new-password">New password</label>
                <input id="new-password" className="input" type="password" autoComplete="new-password"
                  value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby="pw-hint" />
                <span id="pw-hint" className="small muted">At least 8 characters.</span>
              </div>
              <div className="field">
                <label htmlFor="confirm-password">Confirm new password</label>
                <input id="confirm-password" className="input" type="password" autoComplete="new-password"
                  value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={!!error && !!confirm && confirm !== password} />
              </div>
              {error && <p className="form-error" role="alert">{error}</p>}
              <button type="submit" disabled={busy} className="btn btn--lg btn--block btn--primary">
                {busy ? 'Saving…' : 'Save new password'}
              </button>
            </form>
          )}
        </section>
      </main>
    </PublicLayout>
  );
}
