import { describe, it, expect } from 'vitest';
import { sanitizeEnding, sanitizeClosing, resolveEnding, mergeClosing, linesToText, textToLines, CLOSING_LIMITS } from '../src/utils/closing.js';
import { ENDINGS } from '../src/data/memories.js';

describe('editable closing message', () => {
  it('needs a title and at least one line', () => {
    expect(sanitizeEnding({ title: 'T', lines: ['a'] })).toEqual({ title: 'T', lines: ['a'] });
    expect(sanitizeEnding({ title: '', lines: ['a'] })).toBeNull();
    expect(sanitizeEnding({ title: 'T', lines: ['', '   '] })).toBeNull();
    expect(sanitizeEnding(null)).toBeNull();
  });
  it('trims, strips control characters and caps sizes', () => {
    const e = sanitizeEnding({ title: ` ${'T'.repeat(200)} `, lines: Array.from({ length: 30 }, (_, i) => ` line\u0000 ${i} `) });
    expect(e.title).toHaveLength(CLOSING_LIMITS.title);
    expect(e.lines).toHaveLength(CLOSING_LIMITS.lines);
    expect(e.lines[0]).toBe('line 0');
  });
  it('falls back to the default text when nothing valid is stored', () => {
    expect(resolveEnding('standard', {})).toEqual({ title: ENDINGS.standard.title, lines: ENDINGS.standard.lines });
    expect(resolveEnding('extended', { standard: { title: 'x', lines: ['y'] } }).title).toBe(ENDINGS.extended.title);
    expect(resolveEnding('whatever', null).title).toBe(ENDINGS.standard.title);
  });
  it('shows the edited text when valid, per ending', () => {
    expect(resolveEnding('standard', { standard: { title: 'Mine', lines: ['Hello'] } })).toEqual({ title: 'Mine', lines: ['Hello'] });
  });
  it('drops unknown fields from stored data', () => {
    expect(sanitizeClosing({ standard: { title: 'a', lines: ['b'], evil: 1 }, other: 1, updatedAt: 'nope' })).toEqual({ standard: { title: 'a', lines: ['b'] } });
  });
  it('merges device and account copies: the newest wins per ending and nothing else is lost', () => {
    const device = { standard: { title: 'device', lines: ['d'] }, updatedAt: '2026-01-01T00:00:00.000Z' };
    const cloud = { standard: { title: 'cloud', lines: ['c'] }, extended: { title: 'cx', lines: ['c'] }, updatedAt: '2026-02-01T00:00:00.000Z' };
    const m = mergeClosing(device, cloud);
    expect(m.standard.title).toBe('cloud');
    expect(m.extended.title).toBe('cx');
    expect(mergeClosing(cloud, device)).toEqual(m);
    const newerDevice = { ...device, updatedAt: '2026-03-01T00:00:00.000Z' };
    expect(mergeClosing(newerDevice, cloud).standard.title).toBe('device');
    expect(mergeClosing(newerDevice, cloud).extended.title).toBe('cx');
  });
  it('turns lines into text and back without losing paragraphs', () => {
    const lines = ['One.', 'Two.', 'Three.'];
    expect(textToLines(linesToText(lines))).toEqual(lines);
    expect(textToLines('a\r\n\r\n  b  \n')).toEqual(['a', 'b']);
  });
});
