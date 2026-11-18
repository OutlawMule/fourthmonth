// The editable ending message. Pure helpers (no DOM, no network) so they are unit-tested.
//
// Shape (one object holds both endings so it fits in a single database row):
//   { standard?: { title, lines[] }, extended?: { title, lines[] }, updatedAt? }
// A missing key means "use the default text from src/data/memories.js (ENDINGS)".
import { ENDINGS } from '../data/memories.js';

export const CLOSING_LIMITS = Object.freeze({ title: 80, line: 600, lines: 12 });
export const CLOSING_KINDS = Object.freeze(['standard', 'extended']);

const clean = (s) => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();

/** Validates one ending ({title, lines}). Returns null when there is nothing usable. */
export function sanitizeEnding(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = clean(raw.title).slice(0, CLOSING_LIMITS.title);
  const lines = (Array.isArray(raw.lines) ? raw.lines : [])
    .map((l) => clean(l).slice(0, CLOSING_LIMITS.line))
    .filter(Boolean)
    .slice(0, CLOSING_LIMITS.lines);
  if (!title || !lines.length) return null;
  return { title, lines };
}

/** Validates the whole stored object; unknown keys are dropped. */
export function sanitizeClosing(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const kind of CLOSING_KINDS) {
    const e = sanitizeEnding(raw[kind]);
    if (e) out[kind] = e;
  }
  if (typeof raw.updatedAt === 'string' && !Number.isNaN(Date.parse(raw.updatedAt))) out.updatedAt = raw.updatedAt;
  return out;
}

/** The text to show for an ending: the edited copy when valid, otherwise the default. */
export function resolveEnding(kind, override) {
  const k = kind === 'extended' ? 'extended' : 'standard';
  const e = sanitizeEnding(override?.[k]);
  return e ?? { title: ENDINGS[k].title, lines: [...ENDINGS[k].lines] };
}

/** Newest copy wins (same rule as progress merging), compared per ending. */
export function mergeClosing(a, b) {
  const A = sanitizeClosing(a), B = sanitizeClosing(b);
  const aNewer = Date.parse(A.updatedAt ?? 0) >= Date.parse(B.updatedAt ?? 0);
  const [first, second] = aNewer ? [A, B] : [B, A];
  const out = { ...second, ...first };
  const t = first.updatedAt ?? second.updatedAt;
  if (t) out.updatedAt = t;
  return out;
}

/** Text area <-> lines. One paragraph per line; blank lines are ignored. */
export const linesToText = (lines) => (lines ?? []).join('\n');
export const textToLines = (text) => String(text ?? '').split(/\r?\n/).map(clean).filter(Boolean);
