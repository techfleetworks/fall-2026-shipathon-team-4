import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { recordKeysFromEnv } from '../../../server/records/crypto.js';
import { encryptedRecordService, type RecordService } from '../../../server/records/service.js';
import { memoryRecordStore } from '../../../server/records/store.js';
import { parseSavedRecord } from '../../../server/records/record.js';
import { createSyncEngine, OFF, type SyncMeta, type SyncStatus } from './engine.js';
import type { SyncRecord } from './merge.js';
import type { DeleteOutcome, GetOutcome, PutOutcome } from './recordApi.js';

const e = (id: string, detail = id) => ({ id, date: '2026-11-01', type: 'note', title: 'Note', detail });

/** The real encrypted service from PR 1, with the same outcomes the browser's recordApi gives. */
function server() {
  const service = encryptedRecordService(memoryRecordStore(), recordKeysFromEnv({ RECORD_ENCRYPTION_KEY: randomBytes(32).toString('base64') })!);
  let online = true;
  let configured = true;
  const api = (userId: string) => ({
    async get(): Promise<GetOutcome> {
      if (!online) return { status: 'offline' };
      if (!configured) return { status: 'not-configured' };
      const r = await service.load(userId);
      return r ? { status: 'ok', current: { ...r, record: r.record as SyncRecord } } : { status: 'none' };
    },
    async put(record: SyncRecord, baseVersion: number): Promise<PutOutcome> {
      if (!online) return { status: 'offline' };
      if (!configured) return { status: 'not-configured' };
      const parsed = parseSavedRecord(record);
      if (!parsed) return { status: 'error' };
      const out = await service.save(userId, parsed, baseVersion);
      if (out.status === 'saved') return { status: 'ok', version: out.version, updatedAt: out.updatedAt };
      return { status: 'conflict', current: out.current ? { ...out.current, record: out.current.record as SyncRecord } : null };
    },
    async delete(): Promise<DeleteOutcome> {
      if (!online) return { status: 'offline' };
      return (await service.remove(userId)) ? { status: 'ok' } : { status: 'none' };
    },
  });
  return { service, api, setOnline: (v: boolean) => { online = v; }, setConfigured: (v: boolean) => { configured = v; } };
}

/** One device: its own app data and its own sync memory, signed in as `user` (or nobody). */
function device(srv: ReturnType<typeof server>, user: string | null, initial: Record<string, unknown> = {}) {
  let data: Record<string, unknown> = { profile: { name: 'Sam', onboarded: true, passwordHash: { salt: 's', hash: 'h' } }, evidence: [], ...initial };
  let meta: SyncMeta = { ...OFF };
  let signedInAs = user;
  const statuses: SyncStatus[] = [];
  const engine = createSyncEngine({
    currentUserId: async () => signedInAs,
    readLocal: () => data,
    applyLocal: (merged) => {
      const keep = (data.profile as Record<string, unknown> | undefined)?.passwordHash;
      data = { ...data, ...merged, ...(merged.profile ? { profile: { ...(merged.profile as object), ...(keep ? { passwordHash: keep } : {}) } } : {}) };
    },
    loadMeta: () => meta,
    saveMeta: (m) => { meta = m; },
    api: srv.api(signedInAs ?? 'nobody'),
    onStatus: (s) => statuses.push(s),
  });
  return {
    engine,
    get data() { return data; },
    set data(d) { data = d; },
    get meta() { return meta; },
    statuses,
    signInAs: (u: string | null) => { signedInAs = u; },
    add: (id: string, detail = id) => { data = { ...data, evidence: [...(data.evidence as object[]), e(id, detail)] }; },
    remove: (id: string) => { data = { ...data, evidence: (data.evidence as { id: string }[]).filter((x) => x.id !== id) }; },
    ids: () => (data.evidence as { id: string }[]).map((x) => x.id),
  };
}

const serverIds = async (svc: RecordService, user: string) => ((await svc.load(user))?.record.evidence as { id: string }[] | undefined)?.map((x) => x.id);

describe('Visit store sync: opt-in', () => {
  it('sends nothing until turned on', async () => {
    const srv = server();
    const phone = device(srv, 'sam');
    phone.add('a');
    expect(await phone.engine.sync({ pull: true })).toBe('off');
    expect(await srv.service.load('sam')).toBeNull();
  });

  it('turning on backs up the record (without the password hash)', async () => {
    const srv = server();
    const phone = device(srv, 'sam');
    phone.add('a');
    expect(await phone.engine.enable()).toBe('synced');
    const saved = await srv.service.load('sam');
    expect(saved!.record.evidence).toEqual([e('a')]);
    expect(JSON.stringify(saved!.record)).not.toContain('passwordHash');
    expect(phone.meta).toMatchObject({ enabled: true, userId: 'sam', version: 1 });
  });

  it('needs to be signed in to turn on', async () => {
    const srv = server();
    expect(await device(srv, null).engine.enable()).toBe('signed-out');
  });
});

describe('Visit store sync: two devices (the compounding record)', () => {
  it('entries added on each device end up on both', async () => {
    const srv = server();
    const phone = device(srv, 'sam');
    const laptop = device(srv, 'sam');
    phone.add('phone-1');
    await phone.engine.enable();
    laptop.add('laptop-1');
    await laptop.engine.enable(); // first sync on the laptop: keeps both
    await phone.engine.sync({ pull: true });
    expect(phone.ids().sort()).toEqual(['laptop-1', 'phone-1']);
    expect(laptop.ids().sort()).toEqual(['laptop-1', 'phone-1']);
    expect((await serverIds(srv.service, 'sam'))!.sort()).toEqual(['laptop-1', 'phone-1']);
  });

  it('a delete on one device is not undone by the other', async () => {
    const srv = server();
    const phone = device(srv, 'sam', { evidence: [e('a'), e('b')] });
    const laptop = device(srv, 'sam', { evidence: [] });
    await phone.engine.enable();
    await laptop.engine.enable();
    laptop.remove('b');
    await laptop.engine.sync();
    await phone.engine.sync({ pull: true });
    expect(phone.ids()).toEqual(['a']);
    expect(await serverIds(srv.service, 'sam')).toEqual(['a']);
  });

  it('a stale device (409) merges instead of overwriting, then saves', async () => {
    const srv = server();
    const phone = device(srv, 'sam');
    const laptop = device(srv, 'sam');
    await phone.engine.enable();
    await laptop.engine.enable();
    phone.add('from-phone');
    await phone.engine.sync(); // server v2
    laptop.add('from-laptop');
    expect(await laptop.engine.sync()).toBe('synced'); // based on v1 → 409 → merge → v3
    expect((await serverIds(srv.service, 'sam'))!.sort()).toEqual(['from-laptop', 'from-phone']);
    expect(laptop.meta.version).toBe(3);
  });

  it('a sync with nothing new sends nothing', async () => {
    const srv = server();
    const phone = device(srv, 'sam');
    await phone.engine.enable();
    const v = (await srv.service.load('sam'))!.version;
    await phone.engine.sync();
    await phone.engine.sync({ pull: true });
    expect((await srv.service.load('sam'))!.version).toBe(v);
  });
});

describe('Visit store sync: offline and failures keep the device copy', () => {
  it('offline: changes stay on the device, then back up when online', async () => {
    const srv = server();
    const phone = device(srv, 'sam');
    await phone.engine.enable();
    srv.setOnline(false);
    phone.add('written-offline');
    expect(await phone.engine.sync()).toBe('offline');
    expect(phone.ids()).toEqual(['written-offline']);
    srv.setOnline(true);
    expect(await phone.engine.sync({ pull: true })).toBe('synced');
    expect(await serverIds(srv.service, 'sam')).toEqual(['written-offline']);
  });

  it('server not set up: reports it and changes nothing', async () => {
    const srv = server();
    srv.setConfigured(false);
    const phone = device(srv, 'sam');
    phone.add('a');
    expect(await phone.engine.enable()).toBe('not-configured');
    expect(phone.ids()).toEqual(['a']);
  });

  it('signed out: pauses', async () => {
    const srv = server();
    const phone = device(srv, 'sam');
    await phone.engine.enable();
    phone.signInAs(null);
    expect(await phone.engine.sync()).toBe('signed-out');
  });
});

describe('Visit store sync: privacy between accounts on one device', () => {
  it("another account signing in on this device never sends or receives the first person's record", async () => {
    const srv = server();
    const shared = device(srv, 'sam');
    shared.add('sams-note');
    await shared.engine.enable();
    shared.signInAs('riley');
    expect(await shared.engine.sync({ pull: true })).toBe('other-account');
    expect(await srv.service.load('riley')).toBeNull();
  });
});

describe('Visit store sync: turning off and restoring', () => {
  it('turn off and keep the server copy, or delete it', async () => {
    const srv = server();
    const phone = device(srv, 'sam');
    await phone.engine.enable();
    expect(await phone.engine.disable()).toEqual({ deleted: false });
    expect(await srv.service.load('sam')).not.toBeNull();
    expect(phone.meta.enabled).toBe(false);
    await phone.engine.enable();
    expect(await phone.engine.disable({ deleteServerCopy: true })).toEqual({ deleted: true });
    expect(await srv.service.load('sam')).toBeNull();
  });

  it('after turning off, changes are not sent', async () => {
    const srv = server();
    const phone = device(srv, 'sam');
    await phone.engine.enable();
    await phone.engine.disable();
    phone.add('private');
    await phone.engine.sync({ pull: true });
    expect(await serverIds(srv.service, 'sam')).toEqual([]);
  });

  it('a new device restores the backup after log-in and keeps syncing', async () => {
    const srv = server();
    const phone = device(srv, 'sam', { evidence: [e('a'), e('b')], visits: [{ id: 'v1', date: '2026-11-03', priorities: [] }] });
    await phone.engine.enable();
    const newPhone = device(srv, 'sam');
    newPhone.data = { profile: null };
    expect(await newPhone.engine.restoreAfterLogin()).toBe(true);
    expect(newPhone.ids()).toEqual(['a', 'b']);
    expect((newPhone.data.profile as { name: string }).name).toBe('Sam');
    expect(newPhone.meta).toMatchObject({ enabled: true, userId: 'sam' });
    newPhone.add('c');
    await newPhone.engine.sync();
    expect(await serverIds(srv.service, 'sam')).toEqual(['a', 'b', 'c']);
  });

  it('no backup: nothing is restored and sync stays off', async () => {
    const srv = server();
    const fresh = device(srv, 'sam');
    expect(await fresh.engine.restoreAfterLogin()).toBe(false);
    expect(fresh.meta.enabled).toBe(false);
  });
});

describe('Visit store sync: no overlapping syncs', () => {
  it('calls during a sync are folded into one more run', async () => {
    const srv = server();
    const phone = device(srv, 'sam');
    await phone.engine.enable();
    phone.add('x');
    const runs = await Promise.all([phone.engine.sync(), phone.engine.sync(), phone.engine.sync()]);
    expect(runs.every((s) => s === 'synced')).toBe(true);
    expect((await srv.service.load('sam'))!.version).toBe(2);
  });
});
