/**
 * Settings → Privacy and data: "Back up and sync my record" (Visit store, ADR-019). Opt-in, off by default.
 * Also the storage notice the mentor asked for: where the record is, and what happens offline.
 * Uses Diana's existing classes (pcard, toggle-row, switch, btn). All wording is a first draft for Diana and Dominic.
 * Shown only on the real users' site with server sign-in (never on the demo).
 */
import { useState } from 'react';
import { syncAvailable, turnOffSync, turnOnSync, useSyncState } from '../lib/sync';
import type { SyncStatus } from '../lib/sync/engine';

const STATUS_TEXT: Record<SyncStatus, string> = {
  off: '',
  syncing: 'Backing up…',
  synced: 'Backed up',
  offline: 'You’re offline. Changes are saved on this device and will back up when you’re online again.',
  'signed-out': 'Log in again to keep backing up. Your changes are safe on this device.',
  'other-account': 'Backup was turned on by a different account on this device, so it’s paused for you.',
  'not-configured': 'Backup isn’t available yet. Everything stays on this device.',
  error: 'We couldn’t back up just now. We’ll try again. Your changes are safe on this device.',
};

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';

export function BackupSync() {
  const { enabled: on, status, lastSyncedAt } = useSyncState();
  const [confirmOff, setConfirmOff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (!syncAvailable()) return null;

  const turnOn = async () => {
    setBusy(true);
    setNote(null);
    const result = await turnOnSync();
    setBusy(false);
    if (result === 'signed-out') setNote('Log in again to turn on backup. Nothing was sent.');
  };
  const turnOff = async (deleteServerCopy: boolean) => {
    setBusy(true);
    const out = await turnOffSync(deleteServerCopy);
    setBusy(false);
    setConfirmOff(false);
    setNote(
      out.deleted === 'failed'
        ? 'Backup is off, but we couldn’t delete the server copy. Try again when you’re online.'
        : out.deleted
          ? 'Backup is off and the server copy is deleted. Your record is on this device only.'
          : 'Backup is off. Your record is on this device only. The last server copy is kept.',
    );
  };

  return (
    <section className="pcard" aria-labelledby="bk-h">
      <h2 id="bk-h">Back up and sync</h2>
      <div className="toggle-row">
        <span id="bk-l">
          Back up my record and sync it to my other devices
          <span className="small muted" style={{ display: 'block' }}>
            {on
              ? 'Your record is on this device, and an encrypted copy is saved on our server so it’s there when you log in on another device.'
              : 'Off: your record is saved on this device only. If you clear your browser or lose this device, it can’t be recovered.'}
          </span>
        </span>
        <button
          className="switch"
          role="switch"
          aria-checked={on}
          aria-labelledby="bk-l"
          disabled={busy}
          onClick={() => (on ? setConfirmOff(true) : void turnOn())}
        />
      </div>
      {on && (
        <p className="small muted" role="status" aria-live="polite" style={{ margin: 0 }}>
          {status === 'synced' && lastSyncedAt ? `Backed up ${when(lastSyncedAt)}` : STATUS_TEXT[status]}
        </p>
      )}
      <p className="small muted" style={{ margin: 0 }}>
        Works offline: everything is saved on this device first and backs up when you’re online.
      </p>
      {confirmOff && (
        <div className="stack-sm" role="alertdialog" aria-labelledby="bk-q">
          <p id="bk-q"><strong>Turn off backup?</strong> Your record stays on this device.</p>
          <div className="btn-row">
            <button className="btn btn--outline" onClick={() => setConfirmOff(false)} disabled={busy}>Cancel</button>
            <button className="btn btn--outline" onClick={() => void turnOff(false)} disabled={busy}>Turn off, keep server copy</button>
            <button className="btn btn--outline-danger" onClick={() => void turnOff(true)} disabled={busy}>Turn off and delete server copy</button>
          </div>
        </div>
      )}
      {note && <p className="note" role="status">{note}</p>}
    </section>
  );
}
