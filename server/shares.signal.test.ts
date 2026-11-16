/**
 * The instant "stopped" signal (ADR-009): which open doctor pages get told, and that a failed signal
 * never breaks "Stop sharing". A recording notifier stands in for Supabase Realtime (no network).
 */
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { hashTokenInBrowser } from '../src/lib/tokenHash.js';
import type { BriefSnapshot } from '../src/lib/types.js';
import { createApp } from './app.js';
import type { AuthConfig } from './auth.js';
import { recordingNotifier, shareChannel, type ShareNotifier } from './shares/notify.js';
import { hashToken, memoryShareStore } from './shares/store.js';

const brief: BriefSnapshot = { who: 'Theo', priorities: ['Sleepiness'], symptoms: [], tried: 'Not discussed', timeline: [], askingFor: [], demo: true };
const recipient = (n: number) => ({ name: `Dr. ${n}`, role: 'Primary care', email: `doc${n}@clinic.example`, clinic: '' });

function setup(notifier: ShareNotifier = recordingNotifier()) {
  const store = memoryShareStore();
  const auth: AuthConfig = {
    required: true,
    verifyToken: async (t) => (t === 'alice' || t === 'bob' ? { id: t } : null),
    admin: { deleteUser: async (id) => { store.deleteUser(id); return true; } },
  };
  const app = createApp({ auth, shares: store, notifier });
  const as = (who: string) => ({
    post: (body: unknown) => request(app).post('/api/shares').set('Authorization', `Bearer ${who}`).send(body as object),
    del: (path: string) => request(app).delete(path).set('Authorization', `Bearer ${who}`),
  });
  const share = async (n: number, who = 'alice') => {
    const res = await as(who).post({ brief, recipient: recipient(n), days: 7 });
    const token = String(res.body.path).split('/shared/')[1];
    return { id: res.body.share.id as string, channel: shareChannel(hashToken(token)), token };
  };
  return { app, as, share };
}

describe('instant stop signal', () => {
  it('stopping one person signals only that person’s open page', async () => {
    const notifier = recordingNotifier();
    const { as, share } = setup(notifier);
    const lane = await share(1);
    await share(2);
    await as('alice').del(`/api/shares/${lane.id}`);
    expect(notifier.sent).toEqual([lane.channel]);
  });

  it('stopping an already-stopped link sends nothing new', async () => {
    const notifier = recordingNotifier();
    const { as, share } = setup(notifier);
    const lane = await share(1);
    await as('alice').del(`/api/shares/${lane.id}`);
    await as('alice').del(`/api/shares/${lane.id}`);
    expect(notifier.sent).toEqual([lane.channel]);
  });

  it('stop all signals every active link', async () => {
    const notifier = recordingNotifier();
    const { as, share } = setup(notifier);
    const a = await share(1);
    const b = await share(2);
    await as('alice').del('/api/shares');
    expect(notifier.sent.sort()).toEqual([a.channel, b.channel].sort());
  });

  it('deleting the account signals every link that was still open', async () => {
    const notifier = recordingNotifier();
    const { as, share } = setup(notifier);
    const a = await share(1);
    const b = await share(2);
    await as('alice').del(`/api/shares/${a.id}`); // already stopped: not signalled again
    notifier.sent.length = 0;
    expect((await as('alice').del('/api/account')).status).toBe(204);
    expect(notifier.sent).toEqual([b.channel]);
  });

  it('another patient’s attempt signals nothing', async () => {
    const notifier = recordingNotifier();
    const { as, share } = setup(notifier);
    const a = await share(1, 'alice');
    await as('bob').del(`/api/shares/${a.id}`);
    await as('bob').del('/api/shares');
    expect(notifier.sent).toEqual([]);
  });

  it('a failed signal never fails "Stop sharing"', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken: ShareNotifier = { stopped: async () => { throw new Error('realtime down'); } };
    const { app, as, share } = setup(broken);
    const a = await share(1);
    expect((await as('alice').del(`/api/shares/${a.id}`)).status).toBe(204);
    expect((await request(app).get(`/api/shared/${a.token}`)).status).toBe(410);
    warn.mockRestore();
  });

  it('the doctor’s page works out the same channel from its link as the server', async () => {
    const { share } = setup();
    const a = await share(1);
    expect(shareChannel(await hashTokenInBrowser(a.token))).toBe(a.channel);
  });
});
