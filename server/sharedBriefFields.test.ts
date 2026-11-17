import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { recordKeysFromEnv } from './records/crypto.js';
import { encryptedShareStore } from './shares/encrypted.js';
import { memoryShareStore } from './shares/store.js';

describe('a shared link shows everything the one-page brief has', () => {
  it("keeps the patient's name/age and Daily impact (they were dropped before)", async () => {
    const keys = recordKeysFromEnv({ RECORD_ENCRYPTION_KEY: randomBytes(32).toString('base64') })!;
    const app = createApp({
      auth: { required: true, verifyToken: async (t) => (t === 'p' ? { id: 'p' } : null) },
      shares: encryptedShareStore(memoryShareStore(), keys),
    });
    const brief = {
      who: 'Theo, 30 · Visit Dec 5', patient: 'Theo, 30', impact: 'Work or school',
      priorities: ['Daytime sleepiness'], symptoms: [], tried: '', timeline: [], askingFor: [], demo: true,
    };
    const made = await request(app).post('/api/shares').set('Authorization', 'Bearer p')
      .send({ brief, recipient: { name: 'Dr. Lane', role: 'Primary care', email: 'lane@clinic.example', clinic: '' }, days: 7 });
    expect(made.status).toBe(201);
    const seen = await request(app).get(`/api${made.body.path}`);
    expect(seen.body.brief).toMatchObject({ patient: 'Theo, 30', impact: 'Work or school' });
  });
});
