/**
 * Phones and word processors type "smart" quotes: can’t, I’m, “like this”. The app's word patterns (crisis check, doctor
 * terms, cues, after-visit summary) are written with straight quotes, so smart ones made them miss: "I don’t want to be
 * here" typed on an iPhone was NOT caught by the crisis check. Every place that matches people's words runs the text
 * through this first. It only changes quote characters, nothing else.
 */
const SINGLE = /[‘’‚‛ʼ′＇`´]/g; // ‘ ’ ‚ ‛ ʼ ′ ＇ ` ´
const DOUBLE = /[“”„‟″＂]/g; // “ ” „ ‟ ″ ＂

export function straightQuotes(text: string): string {
  return text.replace(SINGLE, "'").replace(DOUBLE, '"');
}
