/**
 * Reading level (ADR-011). Flesch-Kincaid grade level, the standard U.S. formula:
 *   0.39 × (words / sentences) + 11.8 × (syllables / words) − 15.59
 * The app promises "about a 6th-grade reading level" for recaps; the summary is held to that.
 * Syllables are estimated with the usual vowel-group rules (good to about ±1 grade on short text).
 */

export const TARGET_GRADE = 6;

export function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const trimmed = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const groups = trimmed.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

export function readingGrade(text: string): number {
  const sentences = text.split(/[.!?]+(?:\s|$)|\n+/).map((s) => s.trim()).filter((s) => /[a-z]/i.test(s));
  const words = text.match(/[A-Za-z’']+/g) ?? [];
  if (!sentences.length || !words.length) return 0;
  const syllables = words.reduce((n, w) => n + countSyllables(w), 0);
  const grade = 0.39 * (words.length / sentences.length) + 11.8 * (syllables / words.length) - 15.59;
  return Math.max(0, Math.round(grade * 10) / 10);
}
