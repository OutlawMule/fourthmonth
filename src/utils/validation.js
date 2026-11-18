// Input validation + the client-side mirror of the answer-visibility rules.
// IMPORTANT: this is for UX and tests only. Real enforcement is Row Level Security in
// supabase/migrations/*_rls_and_grants.sql - hiding buttons is never the security boundary.
import { getQuestion, maxLengthFor } from '../data/questions.js';

export const VISIBILITIES = Object.freeze(['private', 'shared']);
export const ANSWER_STATUSES = Object.freeze(['draft', 'submitted']);

export function isValidVisibility(v) { return VISIBILITIES.includes(v); }

/**
 * Validates and normalizes an answer for a question.
 * Returns { ok:true, value:{ text, choice } } or { ok:false, error }.
 */
export function validateAnswer(questionKey, input, { allowEmpty = false } = {}) {
  const q = getQuestion(questionKey);
  if (!q) return { ok: false, error: 'Unknown question.' };
  const rawText = typeof input?.text === 'string' ? input.text : '';
  // Collapse control chars, trim; keep line breaks for long answers.
  const text = rawText.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  const choice = typeof input?.choice === 'string' ? input.choice : null;

  if (q.type === 'choice') {
    if (choice == null || choice === '') {
      if (!allowEmpty) return { ok: false, error: 'Pick an option.' };
    } else if (!q.options.includes(choice)) {
      return { ok: false, error: 'That option is not available for this question.' };
    }
  } else if (!text && !allowEmpty) {
    return { ok: false, error: 'Write something first, or skip this question.' };
  }
  const max = q.type === 'choice' ? 400 : maxLengthFor(q);
  if (text.length > max) return { ok: false, error: `Please keep it under ${max} characters.` };
  if (q.type === 'short' && /\n/.test(text)) return { ok: false, error: 'This one is a single line.' };
  return { ok: true, value: { text, choice: q.type === 'choice' ? choice || null : null } };
}

/** Is there anything worth saving? (used to avoid saving empty drafts) */
export function hasContent(value) {
  return Boolean((value?.text ?? '').trim() || value?.choice);
}

// ---- invitation codes -----------------------------------------------------
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const INVITE_CODE_LENGTH = 20;

/** Uppercase, strip separators, apply Crockford look-alike mapping (O->0, I/L->1). */
export function normalizeInviteCode(input) {
  if (typeof input !== 'string') return '';
  return input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
}
export function isValidInviteCodeFormat(input) {
  const c = normalizeInviteCode(input);
  return c.length === INVITE_CODE_LENGTH && [...c].every((ch) => CROCKFORD.includes(ch));
}
export function formatInviteCode(code) {
  const c = normalizeInviteCode(code);
  return c.match(/.{1,5}/g)?.join('-') ?? c;
}

// ---- account fields ---------------------------------------------------------
export function validateEmail(email) {
  const e = (email ?? '').trim();
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return { ok: false, error: 'Enter a valid email address.' };
  return { ok: true, value: e.toLowerCase() };
}
export function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return { ok: false, error: 'Use at least 8 characters.' };
  if (pw.length > 72) return { ok: false, error: 'Passwords can be at most 72 characters.' };
  return { ok: true, value: pw };
}
export function validateDisplayName(name) {
  const n = (name ?? '').replace(/\s+/g, ' ').trim();
  if (n.length < 1) return { ok: false, error: 'Pick a display name.' };
  if (n.length > 32) return { ok: false, error: 'Display names can be up to 32 characters.' };
  return { ok: true, value: n };
}

// ---- visibility mirror (matches the RLS SELECT policy on public.answers) ----
/**
 * Can `viewerId` read this answer row?
 *   own rows: always;  other people's rows: only if submitted + shared + viewer is a member.
 */
export function canViewAnswer(answer, viewerId, memberIdsOfRelationship = []) {
  if (!answer || !viewerId) return false;
  if (answer.author_id === viewerId) return true;
  return (
    answer.visibility === 'shared' &&
    answer.status === 'submitted' &&
    memberIdsOfRelationship.includes(viewerId)
  );
}

/** Never lets a private answer into a list that is meant for the partner. */
export function filterForPartner(answers, partnerId) {
  return answers.filter((a) => a.author_id === partnerId && a.visibility === 'shared' && a.status === 'submitted');
}

/** Pairing rule mirror: at most two members, no duplicates. */
export function canJoinRelationship(memberIds, userId, limit = 2) {
  if (!userId) return { ok: false, reason: 'not-signed-in' };
  if (memberIds.includes(userId)) return { ok: false, reason: 'already-member' };
  if (memberIds.length >= limit) return { ok: false, reason: 'full' };
  return { ok: true };
}

/**
 * Friendly message for network / auth / database failures. It never includes answer text:
 * only the error *code* is inspected, and callers never pass the answer into an error.
 * Specific database error codes are checked first, generic words last.
 */
export function describeError(err) {
  const msg = String((err && (err.message || err.error_description || err.msg)) || err || '');
  const code = String(err?.code ?? '');
  const has = (re) => re.test(msg);
  if (has(/too_many_attempts/i)) return 'Too many tries. Wait a few minutes and try again.';
  if (has(/too_many_invitations/i)) return 'You have created several codes recently. Wait a little before making another.';
  if (has(/invalid_or_expired_code|invalid_or_expired_invitation/i)) return 'That invitation code is invalid, expired, or already used.';
  if (has(/own_code/i)) return 'That code belongs to your own relationship space. Send it to your partner instead.';
  if (has(/already_paired|already_in_relationship/i)) return 'You are already paired. Leave the current space first if you want to join another.';
  if (has(/relationship_full/i)) return 'That relationship space already has two people.';
  if (has(/not_paired/i)) return 'Sharing needs a partner. Pair with your partner first, or keep this answer private.';
  if (has(/question_not_seeded/i)) return 'This question is not in the database yet. Run the question seed SQL (see the README).';
  if (has(/invalid_answer/i)) return 'The server rejected that answer. Check the length and try again.';
  if (has(/fetch|network|failed to fetch|load failed|networkerror|timeout|timed out/i)) return 'Could not reach the server. Check your connection and try again.';
  if (has(/not_authenticated|not authenticated|jwt|refresh token|session/i) || code === '28000' || code === 'PGRST301') return 'Your session expired. Please sign in again.';
  if (code === '42501' || has(/row-level security|permission denied/i)) return 'You do not have permission to do that.';
  return 'Something went wrong. Please try again.';
}

/** Auth-specific wording (sign in / sign up / reset). */
export function describeAuthError(err) {
  const msg = String((err && (err.message || err.error_description)) || '');
  const code = String(err?.code ?? '');
  if (/invalid login credentials|invalid_credentials/i.test(msg + code)) return 'That email and password do not match.';
  if (/email not confirmed|email_not_confirmed/i.test(msg + code)) return 'Confirm your email first: open the link we sent you, then sign in.';
  if (/already registered|user_already_exists|already been registered/i.test(msg + code)) return 'That email already has an account. Try signing in, or reset your password.';
  if (/weak_password|password should|password is too/i.test(msg + code)) return 'Choose a stronger password (at least 8 characters).';
  if (/rate limit|over_email_send_rate_limit|over_request_rate_limit|too many/i.test(msg + code) || err?.status === 429) return 'Too many attempts. Wait a minute and try again.';
  if (/signup.*disabled|signups not allowed|signup_disabled/i.test(msg + code)) return 'New sign-ups are turned off for this game.';
  if (/same_password|different from the old/i.test(msg + code)) return 'Pick a password you have not used before.';
  if (/fetch|network|load failed|timeout/i.test(msg)) return 'Could not reach the server. Check your connection and try again.';
  return 'Could not complete that. Please try again.';
}
