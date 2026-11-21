/**
 * "Save as PDF file" on Share: the same doctor brief the print view showed (DoctorBriefBody, room layout), fitted to
 * one page with the same rules as shared links (onePageBrief.ts), written as a real PDF file.
 */
import { APP_NAME } from './brand';
import { formatDate } from './dates';
import { fitToOnePage } from './onePageBrief';
import { buildPdf, type PdfLine } from './pdf';
import type { BriefSnapshot } from './types';

export function briefPdfLines(input: BriefSnapshot): PdfLine[] {
  const data = fitToOnePage(input).brief;
  const showSummary = data.includeSummary !== false;
  const showPoints = data.includeTalkingPoints !== false;
  const lines: PdfLine[] = [{ text: data.who || 'Patient summary', size: 18, bold: true }];
  if (data.visitDate) lines.push({ text: `Visit: ${formatDate(data.visitDate)}`, muted: true, gap: 2 });
  const heading = (text: string) => lines.push({ text: text.toUpperCase(), size: 9, bold: true, muted: true, gap: 16 });

  if (showPoints && data.priorities.length) {
    heading('Top concerns');
    data.priorities.forEach((p, i) => lines.push({ text: `${i + 1}. ${p}`, size: 12, gap: 4 }));
  }
  if (showSummary && data.symptoms.length) {
    heading('Symptoms');
    data.symptoms.forEach((f) => {
      lines.push({ text: `${f.label}: ${f.clinical}`, gap: 4 });
      if (f.quote) lines.push({ text: `In my words: “${f.quote}”`, muted: true, indent: 12 });
    });
  }
  if (showSummary && data.tried) {
    heading('Already tried');
    lines.push({ text: data.tried, bold: true, gap: 4 });
  }
  if (showPoints) {
    heading('Asking for');
    lines.push({ text: data.askingFor.length ? data.askingFor.join(' · ') : 'To discuss together', bold: true, gap: 4 });
  }
  lines.push({ text: `Prepared by the patient with ${APP_NAME}. Patient-reported.`, size: 9, muted: true, gap: 24 });
  if (data.demo) lines.push({ text: 'Synthetic — illustrative only, not medical advice.', size: 9, muted: true, gap: 2 });
  return lines;
}

export function buildBriefPdf(brief: BriefSnapshot): Uint8Array {
  return buildPdf(briefPdfLines(brief), `Doctor summary${brief.visitDate ? ` for ${formatDate(brief.visitDate)}` : ''}`);
}

/** e.g. "Appointment-Ready-summary-2026-12-30.pdf". */
export const briefPdfName = (visitDate?: string) => `Appointment-Ready-summary${visitDate ? `-${visitDate}` : ''}.pdf`;
