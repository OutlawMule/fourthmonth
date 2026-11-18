// Plain-language labels for where an answer lives. Pure (no DOM, no network).
//
//   device   "Saved on this device"       localStorage in this browser only
//   account  "Saved to your account"      in the database, only the author can read it
//   shared   "Shared with your partner"   in the database, the partner can read it
//
// A *draft* is never visible to the partner, even if "shared" was chosen, so a shared draft
// is labelled as saved to the account until it is submitted.

export const PRIVACIES = Object.freeze(['device', 'private', 'shared']);

export const WHERE_LABELS = Object.freeze({
  device: 'Saved on this device',
  account: 'Saved to your account',
  shared: 'Shared with your partner',
});

/** Which of the three places an answer is effectively in right now. */
export function whereOf(privacy, status) {
  if (privacy === 'device') return 'device';
  if (privacy === 'shared' && status === 'submitted') return 'shared';
  return 'account';
}

/** One-line status for a saved answer, e.g. "Draft - saved on this device". */
export function statusLine(answer) {
  if (!answer) return 'Not answered yet';
  const place = WHERE_LABELS[whereOf(answer.privacy, answer.status)];
  if (answer.status === 'draft') {
    const note = answer.privacy === 'shared' ? ' (not shared until you submit)' : '';
    return `Draft: ${place.charAt(0).toLowerCase()}${place.slice(1)}${note}`;
  }
  return place;
}

/** The three privacy options and whether each can be used right now. */
export function privacyChoices({ configured = false, signedIn = false, paired = false } = {}) {
  return [
    { value: 'device', label: 'Only on this device', hint: 'Stays in this browser. It is never sent anywhere.', enabled: true, reason: '' },
    {
      value: 'private', label: 'Private (my account)', hint: 'Saved online. Your partner cannot see it in the game; whoever runs the database can.',
      enabled: signedIn, reason: !configured ? 'Online features are not set up' : 'Sign in to use this',
    },
    {
      value: 'shared', label: 'Share with my partner', hint: 'Your partner can read this answer.',
      enabled: signedIn && paired, reason: !configured ? 'Online features are not set up' : !signedIn ? 'Sign in to use this' : 'Pair with your partner first',
    },
  ];
}

/** Default for a new answer: guests stay on the device; signed-in players default to private (never shared by default). */
export const defaultPrivacy = ({ signedIn = false } = {}) => (signedIn ? 'private' : 'device');
