/**
 * "Download my data" as a CSV file: one row per saved value, so every section
 * (profile, visits, summaries, playbooks…) fits in a single sheet that opens in
 * Excel, Numbers or Google Sheets. Columns: section, item, field, value.
 */

type Row = [section: string, item: string, field: string, value: string];

/** Fields never exported. */
const OMIT = new Set(['passwordHash']);

/** Quote a cell, and neutralise values a spreadsheet would run as a formula. */
function cell(v: string): string {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Flattens nested objects/arrays into dotted field names ("recap.doctorSaid.1"). */
function flatten(value: unknown, prefix: string, out: [string, string][]) {
  if (value === null || value === undefined || value === '') return;
  if (Array.isArray(value)) {
    if (value.every((v) => typeof v !== 'object' || v === null)) {
      if (value.length) out.push([prefix, value.join('; ')]);
      return;
    }
    value.forEach((v, i) => flatten(v, `${prefix}.${i + 1}`, out));
    return;
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (!OMIT.has(k)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
    }
    return;
  }
  out.push([prefix, String(value)]);
}

/** One label per record: its title/name/date when it has one, else its position. */
function itemLabel(rec: unknown, i: number): string {
  if (rec && typeof rec === 'object') {
    const r = rec as Record<string, unknown>;
    for (const k of ['title', 'name', 'situation', 'date', 'createdAt']) if (typeof r[k] === 'string' && r[k]) return String(r[k]);
  }
  return String(i + 1);
}

export function dataAsCsv(sections: Record<string, unknown>): string {
  const rows: Row[] = [];
  for (const [section, data] of Object.entries(sections)) {
    const records = Array.isArray(data) ? data : data ? [data] : [];
    records.forEach((rec, i) => {
      if (rec === null || typeof rec !== 'object') {
        rows.push([section, String(i + 1), 'value', String(rec)]);
        return;
      }
      const fields: [string, string][] = [];
      flatten(rec, '', fields);
      const label = Array.isArray(data) ? itemLabel(rec, i) : '';
      fields.forEach(([f, v]) => rows.push([section, label, f, v]));
    });
  }
  const header: Row = ['section', 'item', 'field', 'value'];
  // BOM so Excel reads the file as UTF-8 (curly quotes, accents).
  return '﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
