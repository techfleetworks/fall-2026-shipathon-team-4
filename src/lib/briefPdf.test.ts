import { describe, expect, it } from 'vitest';
import { briefPdfLines, briefPdfName, buildBriefPdf } from './briefPdf';
import { buildPdf, wrap } from './pdf';
import type { BriefSnapshot } from './types';

const brief: BriefSnapshot = {
  who: 'Doctor summary · Theo', visitDate: '2026-12-30', priorities: ['Sleep is getting worse', 'Ask about “side effects”'],
  symptoms: [{ label: 'Sleep', clinical: 'Insomnia, most nights', quote: 'I can’t sleep' }], tried: 'Melatonin', timeline: [],
  askingFor: ['A plan'], demo: false,
};
const text = (b: Uint8Array) => Array.from(b, (x) => String.fromCharCode(x)).join('');

describe('Save as PDF file', () => {
  it('writes a valid PDF file with the brief in it', () => {
    const out = text(buildBriefPdf(brief));
    expect(out.startsWith('%PDF-1.4')).toBe(true);
    expect(out.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(out).toContain('(1. Sleep is getting worse) Tj');
    expect(out).toContain('(ALREADY TRIED) Tj');
    // Curly quotes are written as WinAnsi bytes, not dropped.
    expect(out).toContain('\x93side effects\x94');
  });

  it('points the cross-reference table at each object', () => {
    const out = text(buildPdf([{ text: 'Hello' }]));
    const start = Number(out.match(/startxref\n(\d+)/)![1]);
    expect(out.slice(start, start + 4)).toBe('xref');
    const offsets = [...out.slice(start).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    offsets.forEach((o, i) => expect(out.slice(o).startsWith(`${i + 1} 0 obj`)).toBe(true));
  });

  it('wraps long lines and starts new pages', () => {
    expect(wrap('word '.repeat(60), 11, false, 504).length).toBeGreaterThan(1);
    const out = text(buildPdf(Array.from({ length: 120 }, (_, i) => ({ text: `Line ${i}` }))));
    expect(out).toMatch(/\/Count 3 >>/);
  });

  it('leaves out what the person unticked', () => {
    const lines = briefPdfLines({ ...brief, includeTalkingPoints: false }).map((l) => l.text);
    expect(lines).not.toContain('TOP CONCERNS');
    expect(lines).toContain('SYMPTOMS');
  });

  it('names the file after the visit date', () => {
    expect(briefPdfName('2026-12-30')).toBe('Appointment-Ready-summary-2026-12-30.pdf');
  });
});
