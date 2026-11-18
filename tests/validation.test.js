import { describe, it, expect } from 'vitest';
import {
  validateAnswer, hasContent, normalizeInviteCode, isValidInviteCodeFormat, formatInviteCode, validateEmail,
  validatePassword, validateDisplayName, canViewAnswer, filterForPartner, canJoinRelationship, describeError, describeAuthError,
} from '../src/utils/validation.js';
import { MAX_SHORT, MAX_LONG } from '../src/data/questions.js';

describe('answer validation (mirrors the database rules)', () => {
  it('requires something to submit, but allows an empty draft check to be handled by the caller', () => {
    expect(validateAnswer('loved.small', { text: '   ' }).ok).toBe(false);
    expect(validateAnswer('loved.small', { text: '' }, { allowEmpty: true }).ok).toBe(true);
    expect(hasContent({ text: '  ', choice: null })).toBe(false);
    expect(hasContent({ text: '', choice: 'Space' })).toBe(true);
  });

  it('keeps short answers to one line and the right length', () => {
    expect(validateAnswer('act.fav', { text: 'line one\nline two' }).ok).toBe(false);
    expect(validateAnswer('act.fav', { text: 'x'.repeat(MAX_SHORT) }).ok).toBe(true);
    expect(validateAnswer('act.fav', { text: 'x'.repeat(MAX_SHORT + 1) }).ok).toBe(false);
  });

  it('allows paragraphs in long answers up to the limit', () => {
    expect(validateAnswer('loved.small', { text: 'a\n\nb' }).ok).toBe(true);
    expect(validateAnswer('loved.small', { text: 'x'.repeat(MAX_LONG + 1) }).ok).toBe(false);
  });

  it('only accepts listed options on choice questions, with an optional short note', () => {
    expect(validateAnswer('upset.need', { choice: 'Space' })).toMatchObject({ ok: true, value: { choice: 'Space', text: '' } });
    expect(validateAnswer('upset.need', { choice: 'Teleport' }).ok).toBe(false);
    expect(validateAnswer('upset.need', { choice: null }).ok).toBe(false);
    expect(validateAnswer('upset.need', { choice: 'Space', text: 'x'.repeat(401) }).ok).toBe(false);
  });

  it('strips control characters and rejects unknown questions', () => {
    expect(validateAnswer('act.fav', { text: 'he\u0000llo\u0007' })).toMatchObject({ ok: true, value: { text: 'hello' } });
    expect(validateAnswer('not.a.question', { text: 'x' }).ok).toBe(false);
  });
});

describe('invitation codes', () => {
  it('normalizes what people type', () => {
    expect(normalizeInviteCode('abcde-fghjk mnpqr-stvwx')).toBe('ABCDEFGHJKMNPQRSTVWX');
    expect(normalizeInviteCode('0123O 4567I 89ABL CDEFG')).toBe('012304567189AB1CDEFG');   // O -> 0, I and L -> 1
    expect(normalizeInviteCode(null)).toBe('');
  });
  it('accepts exactly 20 Crockford characters', () => {
    expect(isValidInviteCodeFormat('ABCDE-FGHJK-MNPQR-STVWX')).toBe(true);
    expect(isValidInviteCodeFormat('ABCDE-FGHJK-MNPQR-STVW')).toBe(false);
    expect(isValidInviteCodeFormat('ABCDE-FGHJK-MNPQR-STVWU')).toBe(false);   // U is not in the alphabet
    expect(isValidInviteCodeFormat('')).toBe(false);
    expect(isValidInviteCodeFormat(12345)).toBe(false);
  });
  it('groups the code for reading aloud', () => {
    expect(formatInviteCode('abcdefghjkmnpqrstvwx')).toBe('ABCDE-FGHJK-MNPQR-STVWX');
  });
});

describe('account fields', () => {
  it('checks emails', () => {
    expect(validateEmail(' Me@Example.COM ')).toEqual({ ok: true, value: 'me@example.com' });
    for (const bad of ['', 'nope', 'a@b', 'a b@c.de', 'x'.repeat(260) + '@a.bc']) expect(validateEmail(bad).ok, bad).toBe(false);
  });
  it('checks passwords (Supabase Auth hashes them; the browser never stores them)', () => {
    expect(validatePassword('short').ok).toBe(false);
    expect(validatePassword('long enough 1').ok).toBe(true);
    expect(validatePassword('x'.repeat(73)).ok).toBe(false);
  });
  it('checks display names', () => {
    expect(validateDisplayName('  Big   Boss ')).toEqual({ ok: true, value: 'Big Boss' });
    expect(validateDisplayName('').ok).toBe(false);
    expect(validateDisplayName('x'.repeat(33)).ok).toBe(false);
  });
});

describe('visibility mirror of the database policy', () => {
  const row = (over) => ({ author_id: 'a', visibility: 'private', status: 'submitted', ...over });
  it('an author always sees their own answers', () => {
    expect(canViewAnswer(row({ status: 'draft' }), 'a')).toBe(true);
  });
  it('a partner sees only submitted + shared answers, and only as a member', () => {
    expect(canViewAnswer(row({ visibility: 'shared' }), 'b', ['a', 'b'])).toBe(true);
    expect(canViewAnswer(row({ visibility: 'private' }), 'b', ['a', 'b'])).toBe(false);
    expect(canViewAnswer(row({ visibility: 'shared', status: 'draft' }), 'b', ['a', 'b'])).toBe(false);
    expect(canViewAnswer(row({ visibility: 'shared' }), 'c', ['a', 'b'])).toBe(false);
    expect(canViewAnswer(row({ visibility: 'shared' }), null, ['a', 'b'])).toBe(false);
  });
  it('never lets a private answer into the partner list', () => {
    const rows = [row({ visibility: 'shared' }), row({ visibility: 'private' }), row({ visibility: 'shared', status: 'draft' }), row({ author_id: 'z', visibility: 'shared' })];
    expect(filterForPartner(rows, 'a')).toEqual([rows[0]]);
  });
  it('limits a space to two people', () => {
    expect(canJoinRelationship(['a'], 'b')).toEqual({ ok: true });
    expect(canJoinRelationship(['a', 'b'], 'c')).toEqual({ ok: false, reason: 'full' });
    expect(canJoinRelationship(['a'], 'a')).toEqual({ ok: false, reason: 'already-member' });
    expect(canJoinRelationship(['a'], null)).toEqual({ ok: false, reason: 'not-signed-in' });
  });
});

describe('error messages', () => {
  it('map database codes to plain language, specific codes before generic words', () => {
    expect(describeError({ message: 'invalid_or_expired_code' })).toMatch(/invalid, expired, or already used/);   // must not become "session expired"
    expect(describeError({ message: 'too_many_attempts' })).toMatch(/Too many/);
    expect(describeError({ message: 'already_paired' })).toMatch(/already paired/);
    expect(describeError({ message: 'not_paired: sharing needs a partner' })).toMatch(/needs a partner/);
    expect(describeError({ message: 'not_authenticated' })).toMatch(/sign in again/);
    expect(describeError({ message: 'TypeError: Failed to fetch' })).toMatch(/Could not reach the server/);
    expect(describeError({ code: '42501', message: 'new row violates row-level security policy' })).toMatch(/permission/);
    expect(describeError(new Error('???'))).toBe('Something went wrong. Please try again.');
  });
  it('never echoes arbitrary server text back to the player', () => {
    expect(describeError({ message: 'secret answer text here' })).not.toContain('secret');
    expect(describeAuthError({ message: 'secret answer text here' })).not.toContain('secret');
  });
  it('words auth failures kindly and without revealing which part was wrong', () => {
    expect(describeAuthError({ message: 'Invalid login credentials' })).toBe('That email and password do not match.');
    expect(describeAuthError({ status: 429, message: 'x' })).toMatch(/Too many attempts/);
    expect(describeAuthError({ message: 'Email not confirmed' })).toMatch(/Confirm your email/);
  });
});
