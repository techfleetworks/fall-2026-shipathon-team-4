import { describe, expect, it } from 'vitest';
import { shareEmailDraft } from './shareEmail';

const input = {
  recipient: { name: 'Dr. Lane', role: 'Primary care', email: 'lane@clinic.example' },
  url: 'https://app.example/shared/abc',
  expiresAt: '2026-11-19T12:00:00.000Z',
  patientName: 'Theo',
};

describe('shareEmailDraft', () => {
  it('writes a short email with the link and when it ends', () => {
    const e = shareEmailDraft(input);
    expect(e.to).toBe('lane@clinic.example');
    expect(e.subject).toBe('One-page summary for my upcoming visit (Theo)');
    expect(e.body).toContain('Hello Dr. Lane,');
    expect(e.body).toContain('https://app.example/shared/abc');
    expect(e.body).toContain('November 19, 2026');
    expect(e.body).toContain('Theo');
  });

  it('opens the patient’s own email app with everything encoded', () => {
    const e = shareEmailDraft(input);
    expect(e.mailto.startsWith('mailto:lane%40clinic.example?subject=')).toBe(true);
    const params = new URLSearchParams(e.mailto.split('?')[1]);
    expect(params.get('subject')).toBe(e.subject);
    expect(params.get('body')).toBe(e.body);
  });

  it('never puts health details in the email', () => {
    const e = shareEmailDraft(input);
    expect(e.body).not.toMatch(/symptom|dizz|sleep|medication|dose|diagnos(?!is\.)/i);
  });

  it('cannot be used to add recipients or headers', () => {
    const e = shareEmailDraft({ ...input, recipient: { ...input.recipient, email: 'a@b.co\r\nBcc: x@y.z', name: 'Dr.\nLane' } });
    expect(e.to).not.toMatch(/[\r\n]/);
    expect(e.mailto).not.toMatch(/[\r\n]/);
    expect(e.mailto).not.toContain('&bcc=');
  });

  it('works without a patient name', () => {
    const e = shareEmailDraft({ ...input, patientName: undefined });
    expect(e.subject).toBe('One-page summary for my upcoming visit');
    expect(e.body).toContain('your patient');
  });
});
