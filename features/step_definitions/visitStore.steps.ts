import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Given, Then, When } from '@cucumber/cucumber';
import { recordKeysFromEnv } from '../../server/records/crypto.js';
import { parseSavedRecord } from '../../server/records/record.js';
import { encryptedRecordService, type RecordService } from '../../server/records/service.js';
import { memoryRecordStore } from '../../server/records/store.js';
import { createSyncEngine, OFF, type SyncEngine, type SyncMeta, type SyncStatus } from '../../src/lib/sync/engine.js';
import type { SyncRecord } from '../../src/lib/sync/merge.js';

interface Device {
  engine: SyncEngine;
  data: Record<string, unknown>;
  meta: SyncMeta;
  user: string | null;
  online: boolean;
  last?: SyncStatus;
}
interface World { vsService?: RecordService; vs: Record<string, Device> }

const note = (detail: string) => ({ id: detail.replace(/\W+/g, '-'), date: '2026-11-01', type: 'note', title: 'Note', detail });
const notes = (d: Device) => (d.data.evidence as { detail: string }[] | undefined ?? []).map((x) => x.detail);

function makeDevice(w: World, user: string, evidence: object[] = []): Device {
  const d: Device = { engine: undefined as unknown as SyncEngine, data: { profile: { name: user, onboarded: true }, evidence }, meta: { ...OFF }, user, online: true };
  const svc = w.vsService!;
  const off = () => !d.online;
  d.engine = createSyncEngine({
    currentUserId: async () => d.user,
    readLocal: () => d.data,
    applyLocal: (m) => { d.data = { ...d.data, ...m }; },
    loadMeta: () => d.meta,
    saveMeta: (m) => { d.meta = m; },
    api: {
      get: async () => {
        if (off()) return { status: 'offline' };
        const r = await svc.load(d.user!);
        return r ? { status: 'ok', current: { ...r, record: r.record as SyncRecord } } : { status: 'none' };
      },
      put: async (record, base) => {
        if (off()) return { status: 'offline' };
        const out = await svc.save(d.user!, parseSavedRecord(record)!, base);
        return out.status === 'saved' ? { status: 'ok', version: out.version, updatedAt: out.updatedAt } : { status: 'conflict', current: out.current ? { ...out.current, record: out.current.record as SyncRecord } : null };
      },
      delete: async () => ((await svc.remove(d.user!)) ? { status: 'ok' } : { status: 'none' }),
    },
  });
  return d;
}

function fresh(w: World) {
  w.vsService = encryptedRecordService(memoryRecordStore(), recordKeysFromEnv({ RECORD_ENCRYPTION_KEY: randomBytes(32).toString('base64') })!);
  w.vs = {};
}

Given('Sam uses the app on a phone', function (this: World) {
  fresh(this);
  this.vs.phone = makeDevice(this, 'sam');
});
Given('Sam uses the app on a phone and a laptop with backup on', async function (this: World) {
  fresh(this);
  this.vs.phone = makeDevice(this, 'sam');
  this.vs.laptop = makeDevice(this, 'sam');
  await this.vs.phone.engine.enable();
  await this.vs.laptop.engine.enable();
});
Given('Sam uses the app on a phone and a laptop with backup on, both with the note {string}', async function (this: World, text: string) {
  fresh(this);
  this.vs.phone = makeDevice(this, 'sam', [note(text)]);
  this.vs.laptop = makeDevice(this, 'sam', []);
  await this.vs.phone.engine.enable();
  await this.vs.laptop.engine.enable();
});
Given('the phone is offline', function (this: World) { this.vs.phone.online = false; });

const add = (d: Device, text: string) => { d.data = { ...d.data, evidence: [...((d.data.evidence as object[]) ?? []), note(text)] }; };

When('Sam adds the note {string}', async function (this: World, text: string) {
  add(this.vs.phone, text);
  this.vs.phone.last = await this.vs.phone.engine.sync({ pull: true });
});
When('Sam adds the note {string} on the phone and {string} on the laptop', function (this: World, a: string, b: string) {
  add(this.vs.phone, a);
  add(this.vs.laptop, b);
});
When('Sam adds the note {string} on the phone', async function (this: World, text: string) {
  add(this.vs.phone, text);
  this.vs.phone.last = await this.vs.phone.engine.sync();
});
Given('Sam adds the note {string} on the phone and syncs', async function (this: World, text: string) {
  add(this.vs.phone, text);
  await this.vs.phone.engine.sync();
});
When('Sam deletes {string} on the laptop', function (this: World, text: string) {
  const d = this.vs.laptop;
  d.data = { ...d.data, evidence: (d.data.evidence as { detail: string }[]).filter((x) => x.detail !== text) };
});
When('both devices sync', async function (this: World) {
  await this.vs.phone.engine.sync({ pull: true });
  await this.vs.laptop.engine.sync({ pull: true });
  await this.vs.phone.engine.sync({ pull: true });
});
When('the phone is back online and syncs', async function (this: World) {
  this.vs.phone.online = true;
  this.vs.phone.last = await this.vs.phone.engine.sync({ pull: true });
});
When('Sam logs in on a new phone', async function (this: World) {
  const d = makeDevice(this, 'sam');
  d.data = { profile: null };
  this.vs.newPhone = d;
  assert.equal(await d.engine.restoreAfterLogin(), true);
});
When("Riley logs in on Sam's phone", async function (this: World) {
  this.vs.phone.user = 'riley';
  this.vs.phone.last = await this.vs.phone.engine.sync({ pull: true });
});

Then('nothing is saved on the server for Sam', async function (this: World) {
  assert.equal(this.vs.phone.last, 'off');
  assert.equal(await this.vsService!.load('sam'), null);
});
Then('both devices have {string} and {string}', function (this: World, a: string, b: string) {
  for (const d of [this.vs.phone, this.vs.laptop]) assert.deepEqual(notes(d).sort(), [a, b].sort());
});
Then('neither device has {string}', function (this: World, text: string) {
  for (const d of [this.vs.phone, this.vs.laptop]) assert.ok(!notes(d).includes(text), JSON.stringify(notes(d)));
});
Then('the phone says it is offline and still has {string}', function (this: World, text: string) {
  assert.equal(this.vs.phone.last, 'offline');
  assert.ok(notes(this.vs.phone).includes(text));
});
Then('the server has {string}', async function (this: World, text: string) {
  const r = await this.vsService!.load('sam');
  assert.ok((r!.record.evidence as { detail: string }[]).some((x) => x.detail === text));
});
Then('the new phone has {string}', function (this: World, text: string) {
  assert.ok(notes(this.vs.newPhone).includes(text));
});
Then("the phone's sync is paused for Riley and Riley has nothing on the server", async function (this: World) {
  assert.equal(this.vs.phone.last, 'other-account');
  assert.equal(await this.vsService!.load('riley'), null);
});
