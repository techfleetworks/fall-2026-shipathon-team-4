import { describe, expect, it } from 'vitest';
import { dataAsCsv } from './exportCsv';

const rows = (csv: string) => csv.replace(/^﻿/, '').trim().split('\r\n');

describe('dataAsCsv', () => {
  it('writes one row per value with a header', () => {
    const out = rows(dataAsCsv({ medications: [{ name: 'Sertraline', dose: '50 mg' }] }));
    expect(out[0]).toBe('section,item,field,value');
    expect(out).toContain('medications,Sertraline,name,Sertraline');
    expect(out).toContain('medications,Sertraline,dose,50 mg');
  });

  it('never exports the password hash', () => {
    const csv = dataAsCsv({ profile: { name: 'Theo', passwordHash: 'secret-hash' } });
    expect(csv).not.toContain('secret-hash');
    expect(csv).not.toContain('passwordHash');
  });

  it('quotes commas, quotes and new lines', () => {
    const out = dataAsCsv({ visits: [{ date: '2026-12-03', notes: 'Said "rest", then\nleft' }] });
    expect(out).toContain('"Said ""rest"", then\nleft"');
  });

  it('neutralises values a spreadsheet would run as a formula', () => {
    const out = rows(dataAsCsv({ sharedTips: [{ text: '=HYPERLINK("x")' }] }));
    expect(out.some((r) => r.includes(`"'=HYPERLINK(""x"")"`))).toBe(true);
  });

  it('flattens nested objects and lists', () => {
    const out = rows(dataAsCsv({ visits: [{ date: '2026-12-03', priorities: ['Sleep', 'Energy'], recap: { doctorSaid: ['Review in 2 weeks'] } }] }));
    expect(out).toContain('visits,2026-12-03,priorities,Sleep; Energy');
    expect(out).toContain('visits,2026-12-03,recap.doctorSaid,Review in 2 weeks');
  });
});
