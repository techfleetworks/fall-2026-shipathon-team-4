/**
 * A small text-only PDF maker (no library): US Letter pages, Helvetica and Helvetica-Bold, lines wrapped to the
 * page width, new pages as needed. Used by "Save as PDF file" on Share so the person gets a real .pdf file
 * instead of the print dialog. Text is written in the PDF's standard WinAnsi encoding: curly quotes, dashes,
 * bullets and Latin accents work; other characters print as "?".
 */

export interface PdfLine {
  text: string;
  /** Font size in points (default 11). */
  size?: number;
  bold?: boolean;
  /** Grey text (notes, footers). */
  muted?: boolean;
  /** Extra space above, in points. */
  gap?: number;
  /** Left indent, in points. */
  indent?: number;
}

const PAGE = { w: 612, h: 792, margin: 54 };

// Helvetica widths (per 1000 em) for ASCII 32–126, from the standard font metrics.
const W = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556,
  556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

/** Unicode characters outside Latin-1 that WinAnsi has, mapped to their byte. */
const WIN_ANSI: Record<string, number> = {
  '€': 0x80, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99,
};

function toWinAnsi(text: string): number[] {
  const out: number[] = [];
  for (const ch of text.normalize('NFC')) {
    const c = ch.codePointAt(0)!;
    if (ch === '\t') out.push(32);
    else if (c >= 32 && c < 127) out.push(c);
    else if (WIN_ANSI[ch] !== undefined) out.push(WIN_ANSI[ch]);
    else if (c >= 0xa0 && c <= 0xff) out.push(c);
    else if (c >= 32) out.push(63); // ?
  }
  return out;
}

/** Width of one encoded character in points. Bold is measured a little wider, so lines never run past the margin. */
function charWidth(b: number, size: number, bold: boolean): number {
  const w = b >= 32 && b < 127 ? W[b - 32] : 556;
  return (w * (bold ? 1.1 : 1) * size) / 1000;
}

/** Splits one line of text into lines that fit `maxWidth` (breaking at spaces; very long words are cut). */
export function wrap(text: string, size: number, bold: boolean, maxWidth: number): number[][] {
  const bytes = toWinAnsi(text);
  const lines: number[][] = [];
  let line: number[] = [];
  let width = 0;
  let lastSpace = -1;
  for (const b of bytes) {
    line.push(b);
    width += charWidth(b, size, bold);
    if (b === 32) lastSpace = line.length - 1;
    if (width > maxWidth && line.length > 1) {
      if (lastSpace > 0) {
        lines.push(line.slice(0, lastSpace));
        line = line.slice(lastSpace + 1);
      } else {
        lines.push(line.slice(0, -1));
        line = [b];
      }
      width = line.reduce((n, x) => n + charWidth(x, size, bold), 0);
      lastSpace = line.lastIndexOf(32);
    }
  }
  if (line.length || !lines.length) lines.push(line);
  return lines;
}

const esc = (bytes: number[]) =>
  bytes.map((b) => (b === 40 || b === 41 || b === 92 ? `\\${String.fromCharCode(b)}` : String.fromCharCode(b))).join('');

/** Builds the PDF file. `title` goes into the file's properties. */
export function buildPdf(lines: PdfLine[], title = ''): Uint8Array {
  const maxW = PAGE.w - PAGE.margin * 2;
  const pages: string[] = [];
  let ops: string[] = [];
  let y = PAGE.h - PAGE.margin;
  const newPage = () => { pages.push(ops.join('\n')); ops = []; y = PAGE.h - PAGE.margin; };

  for (const l of lines) {
    const size = l.size ?? 11;
    const bold = !!l.bold;
    const lead = size * 1.35;
    const indent = l.indent ?? 0;
    y -= l.gap ?? 0;
    for (const part of wrap(l.text, size, bold, maxW - indent)) {
      if (y - lead < PAGE.margin) newPage();
      y -= lead;
      const grey = l.muted ? '0.42 0.45 0.5 rg' : '0.11 0.14 0.2 rg';
      ops.push(`BT ${grey} /${bold ? 'F2' : 'F1'} ${size} Tf ${(PAGE.margin + indent).toFixed(2)} ${y.toFixed(2)} Td (${esc(part)}) Tj ET`);
    }
  }
  pages.push(ops.join('\n'));

  // Objects: 1 catalog, 2 pages, 3 F1, 4 F2, 5 info, then a page + its content per page.
  const objs: string[] = [];
  const kids = pages.map((_, i) => `${6 + i * 2} 0 R`).join(' ');
  objs.push('<< /Type /Catalog /Pages 2 0 R >>');
  objs.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  objs.push(`<< /Title (${esc(toWinAnsi(title))}) /Producer (Appointment Ready) >>`);
  pages.forEach((content, i) => {
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.w} ${PAGE.h}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${7 + i * 2} 0 R >>`);
    objs.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });

  // Every character above is one byte (WinAnsi), so string length = byte offset.
  let out = '%PDF-1.4\n%âãÏÓ\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}

/** Saves the PDF as a file through the browser's normal download (no print dialog). */
export function savePdf(bytes: Uint8Array, filename: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
